package main

import (
	"backend/handlers"
	"log"
	"os"

	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"
)

func main() {
	// Atlas 連線字串改由環境變數 MONGODB_URI 提供，勿寫死在程式碼
	atlasURI := os.Getenv("MONGODB_URI")
	if atlasURI == "" {
		log.Fatal("MONGODB_URI is not set")
	}
	handlers.InitDB(atlasURI, "SeatDraw")

	r := gin.Default()
	r.Use(cors.Default())

	api := r.Group("/api")
	{
		api.GET("/status", handlers.GetStatus)
		api.GET("/seat", handlers.GetSeat)
		api.POST("/draw", handlers.DrawSeat)
		api.POST("/reset", handlers.ResetSeats)
		api.POST("/init", handlers.InitStatus)
		api.POST("/update-version", handlers.UpdateVersion)

	}

	log.Println("Listening on :8080")
	r.Run("0.0.0.0:8080")
}
