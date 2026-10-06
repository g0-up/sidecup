// Package objectstore ghi file lên Cloudflare R2 qua API tương thích S3.
package objectstore

import (
	"bytes"
	"context"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/credentials"
	"github.com/aws/aws-sdk-go-v2/service/s3"
)

// cacheControl: key chứa uuid nên nội dung không bao giờ đổi, trình duyệt và CDN giữ lâu được.
const cacheControl = "public, max-age=31536000, immutable"

type R2 struct {
	client *s3.Client
	bucket string
}

func NewR2(accountID, accessKeyID, secretAccessKey, bucket string) *R2 {
	client := s3.New(s3.Options{
		Region:       "auto",
		BaseEndpoint: aws.String("https://" + accountID + ".r2.cloudflarestorage.com"),
		Credentials:  credentials.NewStaticCredentialsProvider(accessKeyID, secretAccessKey, ""),
		// SDK mới mặc định gửi checksum CRC cho mọi request; chỉ gửi khi API bắt buộc để R2 không từ chối.
		RequestChecksumCalculation: aws.RequestChecksumCalculationWhenRequired,
		ResponseChecksumValidation: aws.ResponseChecksumValidationWhenRequired,
	})
	return &R2{client: client, bucket: bucket}
}

func (r *R2) Put(ctx context.Context, key, contentType string, body []byte) error {
	_, err := r.client.PutObject(ctx, &s3.PutObjectInput{
		Bucket:        aws.String(r.bucket),
		Key:           aws.String(key),
		Body:          bytes.NewReader(body),
		ContentLength: aws.Int64(int64(len(body))),
		ContentType:   aws.String(contentType),
		CacheControl:  aws.String(cacheControl),
	})
	return err
}
