package handlers

import (
	"context"
	"math/rand"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"go.mongodb.org/mongo-driver/bson"
)

// GetStatus retrieves current seat status
func GetStatus(c *gin.Context) {
	var status SeatStatus
	err := DB.Collection("seat_status").
		FindOne(context.Background(), bson.M{}).
		Decode(&status)

	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	// Return status as-is, frontend expects assignedSeats as array
	c.JSON(http.StatusOK, status)
}

// GetSeat retrieves a user's assigned seat
func GetSeat(c *gin.Context) {
	userID := c.Query("userId")

	// Get status to check user's seat from userSeats map
	var status SeatStatus
	err := DB.Collection("seat_status").
		FindOne(context.Background(), bson.M{}).
		Decode(&status)

	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	// Check if userSeats map exists and user has a seat
	if status.UserSeats != nil {
		if seatNumber, exists := status.UserSeats[userID]; exists {
			c.JSON(http.StatusOK, SeatRecord{
				UserID:     userID,
				SeatNumber: seatNumber,
				Version:    status.Version,
			})
			return
		}
	}

	// Fall back to checking seats collection
	var rec SeatRecord
	err = DB.Collection("seats").
		FindOne(context.Background(), bson.M{"userId": userID}).
		Decode(&rec)

	if err == nil {
		c.JSON(http.StatusOK, rec)
		return
	}

	// No seat found
	c.JSON(http.StatusOK, gin.H{"seatNumber": nil})
}

// DrawSeat handles seat drawing requests
func DrawSeat(c *gin.Context) {
	var req DrawRequest
	if err := c.BindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Get current status
	var status SeatStatus
	if err := DB.Collection("seat_status").
		FindOne(context.Background(), bson.M{}).
		Decode(&status); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	// Initialize userSeats if it doesn't exist
	if status.UserSeats == nil {
		status.UserSeats = make(map[string]int)

		// Populate with any existing records from seats collection
		cursor, err := DB.Collection("seats").Find(context.Background(), bson.M{})
		if err == nil {
			defer cursor.Close(context.Background())

			for cursor.Next(context.Background()) {
				var rec SeatRecord
				if err := cursor.Decode(&rec); err != nil {
					continue
				}
				status.UserSeats[rec.UserID] = rec.SeatNumber
			}
		}

		// Save updated status with userSeats
		_, err = DB.Collection("seat_status").
			UpdateOne(
				context.Background(),
				bson.M{},
				bson.M{"$set": bson.M{"userSeats": status.UserSeats}},
			)

		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
	}

	// Check if user already has a seat
	if seatNum, exists := status.UserSeats[req.UserID]; exists {
		c.JSON(http.StatusOK, SeatRecord{
			UserID:     req.UserID,
			SeatNumber: seatNum,
			Version:    status.Version,
		})
		return
	}

	// Check if all seats are assigned
	if len(status.AssignedSeats) >= status.TotalSeats {
		c.JSON(http.StatusOK, gin.H{"error": "All seats are assigned"})
		return
	}

	// Find available seats
	used := make(map[int]bool)
	for _, seatNum := range status.AssignedSeats {
		used[seatNum] = true
	}

	var availableSeats []int
	for i := 1; i <= status.TotalSeats; i++ {
		if !used[i] {
			availableSeats = append(availableSeats, i)
		}
	}

	// Draw a random seat
	rnd := rand.New(rand.NewSource(time.Now().UnixNano()))
	seat := availableSeats[rnd.Intn(len(availableSeats))]

	// Add to userSeats map
	status.UserSeats[req.UserID] = seat

	// Add to assignedSeats array
	status.AssignedSeats = append(status.AssignedSeats, seat)

	// Update database
	_, err := DB.Collection("seat_status").
		UpdateOne(
			context.Background(),
			bson.M{},
			bson.M{"$set": bson.M{
				"userSeats":     status.UserSeats,
				"assignedSeats": status.AssignedSeats,
			}},
		)

	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	// Also save to seats collection for compatibility
	rec := SeatRecord{
		UserID:     req.UserID,
		SeatNumber: seat,
		Version:    status.Version,
	}

	_, err = DB.Collection("seats").InsertOne(context.Background(), rec)
	if err != nil {
		// Not critical, just log it
		// log.Printf("Failed to save to seats collection: %v", err)
	}

	c.JSON(http.StatusOK, rec)
}

// UpdateVersion generates a new version and shuffles existing seat assignments
// while preserving user-seat relationships
func UpdateVersion(c *gin.Context) {
	// Get current status
	var status SeatStatus
	if err := DB.Collection("seat_status").
		FindOne(context.Background(), bson.M{}).
		Decode(&status); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	// Make sure userSeats exists
	if status.UserSeats == nil {
		status.UserSeats = make(map[string]int)

		// Populate from seats collection
		cursor, err := DB.Collection("seats").Find(context.Background(), bson.M{})
		if err == nil {
			defer cursor.Close(context.Background())

			for cursor.Next(context.Background()) {
				var rec SeatRecord
				if err := cursor.Decode(&rec); err != nil {
					continue
				}
				status.UserSeats[rec.UserID] = rec.SeatNumber
			}
		}
	}

	// Get all users and their current seats
	userIDs := make([]string, 0, len(status.UserSeats))
	for userID := range status.UserSeats {
		userIDs = append(userIDs, userID)
	}

	// Generate new version
	newVersion := time.Now().Format("20060102-150405")

	// Shuffle user IDs to randomize seat assignments
	rnd := rand.New(rand.NewSource(time.Now().UnixNano()))
	rnd.Shuffle(len(userIDs), func(i, j int) {
		userIDs[i], userIDs[j] = userIDs[j], userIDs[i]
	})

	// Extract the seat numbers we have
	seatNumbers := make([]int, 0, len(status.UserSeats))
	for _, seat := range status.UserSeats {
		seatNumbers = append(seatNumbers, seat)
	}

	// Shuffle seat numbers
	rnd.Shuffle(len(seatNumbers), func(i, j int) {
		seatNumbers[i], seatNumbers[j] = seatNumbers[j], seatNumbers[i]
	})

	// Create new mappings
	newUserSeats := make(map[string]int)
	newAssignedSeats := make([]int, 0, len(userIDs))

	// Assign shuffled seats to users
	for i, userID := range userIDs {
		if i < len(seatNumbers) {
			newUserSeats[userID] = seatNumbers[i]
			newAssignedSeats = append(newAssignedSeats, seatNumbers[i])
		}
	}

	// Update status collection
	_, err := DB.Collection("seat_status").
		UpdateOne(
			context.Background(),
			bson.M{},
			bson.M{"$set": bson.M{
				"version":       newVersion,
				"userSeats":     newUserSeats,
				"assignedSeats": newAssignedSeats,
			}},
		)

	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	// Update seats collection
	// First delete all records
	_, err = DB.Collection("seats").DeleteMany(context.Background(), bson.M{})
	if err != nil {
		// Not critical
	}

	// Insert new records
	for userID, seatNum := range newUserSeats {
		rec := SeatRecord{
			UserID:     userID,
			SeatNumber: seatNum,
			Version:    newVersion,
		}

		_, err := DB.Collection("seats").InsertOne(context.Background(), rec)
		if err != nil {
			// Not critical
		}
	}

	c.JSON(http.StatusOK, gin.H{"version": newVersion})
}

// ResetSeats shuffles all seat assignments and updates version
func ResetSeats(c *gin.Context) {
	// Get current status
	var status SeatStatus
	if err := DB.Collection("seat_status").
		FindOne(context.Background(), bson.M{}).
		Decode(&status); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	// Get all users
	userIDs := make([]string, 0)
	if status.UserSeats != nil {
		for userID := range status.UserSeats {
			userIDs = append(userIDs, userID)
		}
	} else {
		// Fall back to getting users from seats collection
		cursor, err := DB.Collection("seats").Find(context.Background(), bson.M{})
		if err == nil {
			defer cursor.Close(context.Background())

			for cursor.Next(context.Background()) {
				var rec SeatRecord
				if err := cursor.Decode(&rec); err != nil {
					continue
				}
				userIDs = append(userIDs, rec.UserID)
			}
		}
	}

	// Generate all seat numbers
	allSeats := make([]int, status.TotalSeats)
	for i := 0; i < status.TotalSeats; i++ {
		allSeats[i] = i + 1
	}

	// Shuffle seats
	rnd := rand.New(rand.NewSource(time.Now().UnixNano()))
	rnd.Shuffle(len(allSeats), func(i, j int) {
		allSeats[i], allSeats[j] = allSeats[j], allSeats[i]
	})

	// Generate new version
	newVersion := time.Now().Format("20060102-150405")

	// Create new userSeats map
	newUserSeats := make(map[string]int)
	newAssignedSeats := make([]int, 0)

	// Assign shuffled seats to users
	for i, userID := range userIDs {
		if i < len(allSeats) {
			newUserSeats[userID] = allSeats[i]
			newAssignedSeats = append(newAssignedSeats, allSeats[i])
		}
	}

	// Update status collection
	_, err := DB.Collection("seat_status").
		UpdateOne(
			context.Background(),
			bson.M{},
			bson.M{"$set": bson.M{
				"version":       newVersion,
				"userSeats":     newUserSeats,
				"assignedSeats": newAssignedSeats,
			}},
		)

	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	// Update seats collection for compatibility
	// First delete all existing records
	_, err = DB.Collection("seats").DeleteMany(context.Background(), bson.M{})
	if err != nil {
		// Not critical, just log it
		// log.Printf("Failed to delete seats: %v", err)
	}

	// Insert new records
	for userID, seatNum := range newUserSeats {
		rec := SeatRecord{
			UserID:     userID,
			SeatNumber: seatNum,
			Version:    newVersion,
		}

		_, err := DB.Collection("seats").InsertOne(context.Background(), rec)
		if err != nil {
			// Not critical, just log it
			// log.Printf("Failed to insert seat: %v", err)
		}
	}

	c.JSON(http.StatusOK, gin.H{"version": newVersion})
}
