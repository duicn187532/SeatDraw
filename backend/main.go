package main

import (
	"backend/handlers"
	"log"

	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"
)

func main() {
	// 用你的 Atlas 連線字串，並指定資料庫名稱
	atlasURI := "mongodb+srv://root:21airr01@mycluster.wk4zgas.mongodb.net/?retryWrites=true&w=majority&appName=MyCluster"
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
