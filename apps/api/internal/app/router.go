// Package app là nơi duy nhất lắp feature vào router và nối phụ thuộc giữa chúng.
package app

import (
	"context"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"

	"sidecup/api/internal/features/auth"
	"sidecup/api/internal/features/menu"
	"sidecup/api/internal/features/notifications"
	"sidecup/api/internal/features/orders"
	"sidecup/api/internal/features/partners"
	"sidecup/api/internal/features/payments"
	"sidecup/api/internal/features/products"
	"sidecup/api/internal/features/qrcodes"
	"sidecup/api/internal/features/reports"
	"sidecup/api/internal/features/settings"
	"sidecup/api/internal/platform/apperr"
	"sidecup/api/internal/platform/clock"
	"sidecup/api/internal/platform/config"
	"sidecup/api/internal/platform/db"
	"sidecup/api/internal/platform/httpx"
	"sidecup/api/internal/platform/middleware"
	"sidecup/api/internal/platform/realtime"
)

type Deps struct {
	Config config.Config
	DB     *gorm.DB
	Clock  clock.Clock
	Hub    *realtime.Hub
}

// App giữ router và các tiến trình nền mà main cần chạy/dừng cùng server.
type App struct {
	Engine    *gin.Engine
	Scheduler *orders.Scheduler
	Notifier  *notifications.Service
	Menu      *menu.Broadcaster
	Orders    *orders.Service
}

// Tin cậy X-Forwarded-For chỉ từ mạng nội bộ (Caddy trong docker, proxy của Vite) để rate limit đúng IP khách.
var trustedProxies = []string{"127.0.0.1/32", "::1/128", "10.0.0.0/8", "172.16.0.0/12", "192.168.0.0/16"}

func New(d Deps) (*App, error) {
	cfg := d.Config
	if cfg.AppEnv != "dev" {
		gin.SetMode(gin.ReleaseMode)
	}
	r := gin.New()
	if err := r.SetTrustedProxies(trustedProxies); err != nil {
		return nil, err
	}
	r.Use(middleware.RequestID(), middleware.Logger("/healthz", "/readyz"), middleware.Recover())
	if len(cfg.CORSOrigins) > 0 {
		r.Use(middleware.CORS(cfg.CORSOrigins))
	}

	menuCast := menu.NewBroadcaster(d.DB, d.Hub, d.Clock)
	authSvc := auth.NewService(cfg.SellerPasswordHash, cfg.SessionSecret, d.Clock)
	notifySvc := notifications.NewService(d.DB, d.Clock, d.Hub)
	orderSvc := orders.NewService(d.DB, d.Clock, d.Hub, notifications.OutboxRepo{}, cfg.PublicBaseURL)

	authH := auth.NewHandler(authSvc, cfg.SecureCookies())
	settingsH := settings.NewHandler(settings.NewService(d.DB, d.Hub, menuCast))
	productsH := products.NewHandler(products.NewService(d.DB, menuCast))
	partnersH := partners.NewHandler(partners.NewService(d.DB, menuCast))
	qrH := qrcodes.NewHandler(qrcodes.NewService(d.DB, d.Clock, d.Hub, cfg.PublicBaseURL))
	menuH := menu.NewHandler(menu.NewService(d.DB, d.Clock))
	ordersH := orders.NewHandler(orderSvc)
	paymentsH := payments.NewHandler(payments.NewService(d.DB))
	reportsH := reports.NewHandler(reports.NewService(d.DB, d.Clock))
	notifyH := notifications.NewHandler(notifySvc)

	healthz := func(c *gin.Context) { c.JSON(http.StatusOK, gin.H{"status": "ok"}) }
	r.GET("/healthz", healthz)
	// Cùng endpoint dưới /api để kiểm tra đường proxy của web (Vite dev, nginx, Caddy).
	r.GET("/api/healthz", healthz)
	r.GET("/readyz", func(c *gin.Context) {
		ctx, cancel := context.WithTimeout(c.Request.Context(), time.Second)
		defer cancel()
		if err := db.Ping(ctx, d.DB); err != nil {
			c.JSON(http.StatusServiceUnavailable, gin.H{"status": "unavailable"})
			return
		}
		c.JSON(http.StatusOK, gin.H{"status": "ok"})
	})

	api := r.Group("/api")

	// Khách: không đăng nhập, bắt buộc X-Client-Id.
	customer := api.Group("", middleware.ClientID())
	menuH.RegisterCustomer(customer)
	ordersH.RegisterCustomer(customer,
		middleware.RateLimit(middleware.NewLimiter(10), middleware.ByClientID),
		middleware.RateLimit(middleware.NewLimiter(30), middleware.ByIP),
	)

	// Người bán.
	authH.RegisterPublic(api, middleware.RateLimit(middleware.NewLimiter(5), middleware.ByIP))
	sellerAuth := middleware.SellerAuth(auth.CookieName, authSvc.VerifyCookie)
	seller := api.Group("/seller", sellerAuth)
	authH.RegisterSeller(seller)
	settingsH.RegisterSeller(seller)
	productsH.RegisterSeller(seller)
	partnersH.RegisterSeller(seller)
	qrH.RegisterSeller(seller)
	ordersH.RegisterSeller(seller)
	paymentsH.RegisterSeller(seller)
	reportsH.RegisterSeller(seller)
	notifyH.RegisterSeller(seller)

	// Nội bộ cho dịch vụ notifier Zalo; reverse proxy trả 404 cho /internal từ Internet.
	notifyH.RegisterInternal(r.Group("/internal", middleware.NotifierAuth(cfg.NotifierToken)))

	origins := []string{cfg.PublicHost}
	r.GET("/ws/seller", sellerAuth, realtime.SellerHandler(d.Hub, origins))
	r.GET("/ws/customer", middleware.RateLimit(middleware.NewLimiter(60), middleware.ByIP),
		realtime.CustomerHandler(d.Hub, menu.NewCustomerAuthorizer(d.DB), origins))

	r.NoRoute(func(c *gin.Context) { httpx.Fail(c, apperr.NotFound("NOT_FOUND", "Không tìm thấy")) })
	r.NoMethod(func(c *gin.Context) {
		httpx.Fail(c, apperr.New(http.StatusMethodNotAllowed, "METHOD_NOT_ALLOWED", "Phương thức không được hỗ trợ"))
	})
	r.HandleMethodNotAllowed = true

	return &App{
		Engine:    r,
		Scheduler: orders.NewScheduler(orderSvc),
		Notifier:  notifySvc,
		Menu:      menuCast,
		Orders:    orderSvc,
	}, nil
}
