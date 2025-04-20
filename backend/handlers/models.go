package handlers

// SeatStatus represents the state of all seats
type SeatStatus struct {
	Version       string `json:"version" bson:"version"`
	TotalSeats    int    `json:"totalSeats" bson:"totalSeats"`
	AssignedSeats []int  `json:"assignedSeats" bson:"assignedSeats"`
	// We'll add a new field for user-seat mapping
	UserSeats map[string]int `json:"userSeats" bson:"userSeats,omitempty"`
}

// SeatRecord represents a user's assigned seat
type SeatRecord struct {
	UserID     string `json:"userId" bson:"userId"`
	SeatNumber int    `json:"seatNumber" bson:"seatNumber"`
	Version    string `json:"version" bson:"version"`
}

// DrawRequest represents a seat draw request
type DrawRequest struct {
	UserID string `json:"userId" binding:"required"`
}
