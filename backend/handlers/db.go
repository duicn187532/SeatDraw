package handlers

import (
	"context"
	"log"
	"time"

	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"
)

var DB *mongo.Database

// uri: Atlas 連線字串（含使用者、密碼與預設資料庫名稱）
// dbName: 你要操作的資料庫名稱（通常與 URI 最後一段相同）
func InitDB(uri, dbName string) {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	clientOpts := options.Client().ApplyURI(uri)
	client, err := mongo.Connect(ctx, clientOpts)
	if err != nil {
		log.Fatal("Mongo Connect:", err)
	}

	// 驗證連線是否成功
	if err := client.Ping(ctx, nil); err != nil {
		log.Fatal("Mongo Ping:", err)
	}

	DB = client.Database(dbName)
	log.Println("Connected to MongoDB Atlas:", dbName)
}
