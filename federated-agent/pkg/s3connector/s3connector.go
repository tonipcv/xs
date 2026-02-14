package s3connector

import (
	"context"
	"fmt"
	"io"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/xitongsys/parquet-go-source/s3v2"
	"github.com/xitongsys/parquet-go/reader"
	"github.com/xitongsys/parquet-go/source"
)

// S3Connector handles S3/Parquet data access
type S3Connector struct {
	client *s3.Client
	region string
}

// NewS3Connector creates a new S3 connector
func NewS3Connector(region string) (*S3Connector, error) {
	cfg, err := config.LoadDefaultConfig(context.TODO(),
		config.WithRegion(region),
	)
	if err != nil {
		return nil, fmt.Errorf("failed to load AWS config: %w", err)
	}

	client := s3.NewFromConfig(cfg)

	return &S3Connector{
		client: client,
		region: region,
	}, nil
}

// QueryParquet queries a Parquet file in S3 with filters
func (c *S3Connector) QueryParquet(ctx context.Context, bucket, key string, filters map[string]interface{}) ([]map[string]interface{}, error) {
	// Create S3 file reader
	fr, err := s3v2.NewS3FileReaderWithClient(ctx, c.client, bucket, key)
	if err != nil {
		return nil, fmt.Errorf("failed to create S3 file reader: %w", err)
	}
	defer fr.Close()

	// Create Parquet reader
	pr, err := reader.NewParquetReader(fr, nil, 4)
	if err != nil {
		return nil, fmt.Errorf("failed to create Parquet reader: %w", err)
	}
	defer pr.ReadStop()

	numRows := int(pr.GetNumRows())
	results := make([]map[string]interface{}, 0, numRows)

	// Read all rows
	for i := 0; i < numRows; i++ {
		row := make(map[string]interface{})
		if err := pr.Read(&row); err != nil {
			if err == io.EOF {
				break
			}
			return nil, fmt.Errorf("failed to read row: %w", err)
		}

		// Apply filters
		if c.matchesFilters(row, filters) {
			results = append(results, row)
		}
	}

	return results, nil
}

// matchesFilters checks if a row matches the given filters
func (c *S3Connector) matchesFilters(row map[string]interface{}, filters map[string]interface{}) bool {
	for key, expectedValue := range filters {
		actualValue, exists := row[key]
		if !exists {
			return false
		}

		// Simple equality check (can be extended for complex operators)
		if actualValue != expectedValue {
			return false
		}
	}
	return true
}

// ListObjects lists objects in an S3 bucket with a prefix
func (c *S3Connector) ListObjects(ctx context.Context, bucket, prefix string) ([]string, error) {
	input := &s3.ListObjectsV2Input{
		Bucket: aws.String(bucket),
		Prefix: aws.String(prefix),
	}

	var keys []string
	paginator := s3.NewListObjectsV2Paginator(c.client, input)

	for paginator.HasMorePages() {
		page, err := paginator.NextPage(ctx)
		if err != nil {
			return nil, fmt.Errorf("failed to list objects: %w", err)
		}

		for _, obj := range page.Contents {
			keys = append(keys, *obj.Key)
		}
	}

	return keys, nil
}

// GetObjectMetadata gets metadata for an S3 object
func (c *S3Connector) GetObjectMetadata(ctx context.Context, bucket, key string) (map[string]string, error) {
	input := &s3.HeadObjectInput{
		Bucket: aws.String(bucket),
		Key:    aws.String(key),
	}

	result, err := c.client.HeadObject(ctx, input)
	if err != nil {
		return nil, fmt.Errorf("failed to get object metadata: %w", err)
	}

	metadata := make(map[string]string)
	for k, v := range result.Metadata {
		metadata[k] = v
	}

	return metadata, nil
}

// S3FileReader implements parquet-go source.ParquetFile interface
type S3FileReader struct {
	client *s3.Client
	bucket string
	key    string
	offset int64
	size   int64
}

// Read reads data from S3
func (r *S3FileReader) Read(p []byte) (n int, err error) {
	rangeHeader := fmt.Sprintf("bytes=%d-%d", r.offset, r.offset+int64(len(p))-1)

	input := &s3.GetObjectInput{
		Bucket: aws.String(r.bucket),
		Key:    aws.String(r.key),
		Range:  aws.String(rangeHeader),
	}

	result, err := r.client.GetObject(context.TODO(), input)
	if err != nil {
		return 0, err
	}
	defer result.Body.Close()

	n, err = result.Body.Read(p)
	r.offset += int64(n)
	return n, err
}

// Seek seeks to a position in the S3 object
func (r *S3FileReader) Seek(offset int64, whence int) (int64, error) {
	switch whence {
	case io.SeekStart:
		r.offset = offset
	case io.SeekCurrent:
		r.offset += offset
	case io.SeekEnd:
		r.offset = r.size + offset
	default:
		return 0, fmt.Errorf("invalid whence: %d", whence)
	}
	return r.offset, nil
}

// Close closes the reader
func (r *S3FileReader) Close() error {
	return nil
}

// Open implements source.ParquetFile
func (r *S3FileReader) Open(name string) (source.ParquetFile, error) {
	return r, nil
}

// Create is not supported for S3
func (r *S3FileReader) Create(name string) (source.ParquetFile, error) {
	return nil, fmt.Errorf("create not supported for S3")
}

// Write is not supported for S3
func (r *S3FileReader) Write(p []byte) (n int, err error) {
	return 0, fmt.Errorf("write not supported for S3")
}
