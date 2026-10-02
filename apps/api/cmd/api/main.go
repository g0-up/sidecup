package main

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"net"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"golang.org/x/sync/errgroup"

	"sidecup/api/internal/app"
	"sidecup/api/internal/features/zalo"
	"sidecup/api/internal/platform/clock"
	"sidecup/api/internal/platform/config"
	"sidecup/api/internal/platform/db"
	"sidecup/api/internal/platform/realtime"
)

const usage = `Cách dùng: api [serve | migrate up|down|version | seed | healthcheck]`

var errUsage = errors.New("lệnh không hợp lệ")

func main() {
	cmd := "serve"
	if len(os.Args) > 1 {
		cmd = os.Args[1]
	}
	var err error
	switch cmd {
	case "serve":
		err = serve()
	case "migrate":
		err = migrateCmd(os.Args[2:])
	case "seed":
		err = seedCmd()
	case "healthcheck":
		err = healthcheck()
	default:
		err = errUsage
	}
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		if errors.Is(err, errUsage) {
			fmt.Fprintln(os.Stderr, usage)
		}
		os.Exit(1)
	}
}

func setupLogger(level string) {
	var l slog.Level
	_ = l.UnmarshalText([]byte(level))
	slog.SetDefault(slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{Level: l})))
}

func serve() error {
	cfg, err := config.Load()
	if err != nil {
		return fmt.Errorf("cấu hình không hợp lệ:\n%w", err)
	}
	setupLogger(cfg.LogLevel)

	if cfg.MigrateOnStart {
		if err := db.Migrate(cfg.DatabaseURL, db.Up); err != nil {
			return fmt.Errorf("migrate: %w", err)
		}
	}
	gdb, err := db.Open(cfg.DatabaseURL, cfg.LogLevel)
	if err != nil {
		return err
	}
	defer func() { _ = db.Close(gdb) }()

	clk := clock.NewReal(cfg.Location)
	hub := realtime.NewHub(clk.Now)
	a, err := app.New(app.Deps{Config: cfg, DB: gdb, Clock: clk, Hub: hub})
	if err != nil {
		return err
	}

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	srv := &http.Server{
		Addr:              cfg.HTTPAddr,
		Handler:           a.Engine,
		ReadHeaderTimeout: 10 * time.Second,
		ReadTimeout:       30 * time.Second,
		IdleTimeout:       120 * time.Second,
		BaseContext:       func(net.Listener) context.Context { return ctx },
	}

	g, gctx := errgroup.WithContext(ctx)
	g.Go(func() error {
		slog.Info("http listening", "addr", cfg.HTTPAddr, "env", cfg.AppEnv)
		if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			return err
		}
		return nil
	})
	g.Go(func() error { return a.Scheduler.Run(gctx) })
	g.Go(func() error { return a.Notifier.Monitor(gctx) })
	g.Go(func() error { return a.Dispatcher.Run(gctx) })
	if a.Zalo != nil {
		a.Zalo.StartHealthProbe(gctx, zalo.ProbeOptions{})
	}
	g.Go(func() error {
		<-gctx.Done()
		slog.Info("shutting down")
		hub.CloseAll()
		shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		err := srv.Shutdown(shutdownCtx)
		if a.Zalo != nil {
			a.Zalo.Close()
		}
		return err
	})
	return g.Wait()
}

func migrateCmd(args []string) error {
	cfg, err := config.LoadDatabase()
	if err != nil {
		return err
	}
	dir := "up"
	if len(args) > 0 {
		dir = args[0]
	}
	switch dir {
	case "up", "down":
		if err := db.Migrate(cfg.DatabaseURL, db.Direction(dir)); err != nil {
			return err
		}
		fallthrough
	case "version":
		v, dirty, err := db.Version(cfg.DatabaseURL)
		if err != nil {
			return err
		}
		fmt.Printf("schema version %d (dirty=%t)\n", v, dirty)
		return nil
	default:
		return errUsage
	}
}

// healthcheck cho Docker (image distroless không có curl).
func healthcheck() error {
	addr := os.Getenv("HTTP_ADDR")
	if addr == "" {
		addr = ":8080"
	}
	if strings.HasPrefix(addr, ":") {
		addr = "127.0.0.1" + addr
	}
	client := http.Client{Timeout: 3 * time.Second}
	resp, err := client.Get("http://" + addr + "/readyz") //nolint:noctx // lệnh CLI chạy một lần
	if err != nil {
		return err
	}
	defer func() { _ = resp.Body.Close() }()
	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("readyz trả %d", resp.StatusCode)
	}
	return nil
}
