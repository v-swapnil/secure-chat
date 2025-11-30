package api

import (
	"database/sql"
	"encoding/json"
	"net/http"

	"github.com/google/uuid"
	"github.com/lib/pq"
	"github.com/secret-project/backend/internal/db"
	"github.com/secret-project/backend/internal/models"
)

type MatchHandler struct {
	db *db.DB
}

func NewMatchHandler(database *db.DB) *MatchHandler {
	return &MatchHandler{db: database}
}

func (h *MatchHandler) JoinQueue(w http.ResponseWriter, r *http.Request) {
	userID, ok := GetUserID(r)
	if !ok {
		respondWithError(w, http.StatusUnauthorized, "Unauthorized")
		return
	}

	var req models.JoinMatchQueueRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondWithError(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	if len(req.CategoryTags) == 0 || req.EphemeralIdentityKey == "" || req.EphemeralSignedPreKey == "" {
		respondWithError(w, http.StatusBadRequest, "Missing required fields")
		return
	}

	anonymousID := uuid.New()

	// Insert into queue
	query := `
		INSERT INTO match_queue (user_id, anonymous_id, category_tags, ephemeral_identity_key, ephemeral_signed_prekey)
		VALUES ($1, $2, $3, $4, $5)
		RETURNING id
	`
	var queueID uuid.UUID
	err := h.db.Conn().QueryRow(query, userID, anonymousID, pq.Array(req.CategoryTags),
		req.EphemeralIdentityKey, req.EphemeralSignedPreKey).Scan(&queueID)
	if err != nil {
		respondWithError(w, http.StatusInternalServerError, "Failed to join queue")
		return
	}

	// Try to find a match
	go h.findMatch(queueID, userID, anonymousID, req.CategoryTags)

	respondWithJSON(w, http.StatusOK, map[string]interface{}{
		"queue_id":     queueID,
		"anonymous_id": anonymousID,
		"message":      "Joined matching queue",
	})
}

func (h *MatchHandler) GetStatus(w http.ResponseWriter, r *http.Request) {
	userID, ok := GetUserID(r)
	if !ok {
		respondWithError(w, http.StatusUnauthorized, "Unauthorized")
		return
	}

	// Check for active match
	var match models.ActiveMatch
	var partnerAnonymousID uuid.UUID
	var partnerEphemeralKey, partnerSignedPreKey string

	matchQuery := `
		SELECT 
			am.id, 
			am.anonymous1_id, 
			am.anonymous2_id,
			CASE 
				WHEN am.user1_id = $1 THEN mq2.ephemeral_identity_key
				ELSE mq1.ephemeral_identity_key
			END as partner_ephemeral_key,
			CASE 
				WHEN am.user1_id = $1 THEN mq2.ephemeral_signed_prekey
				ELSE mq1.ephemeral_signed_prekey
			END as partner_signed_prekey,
			CASE 
				WHEN am.user1_id = $1 THEN am.anonymous2_id
				ELSE am.anonymous1_id
			END as partner_anonymous_id
		FROM active_matches am
		LEFT JOIN match_queue mq1 ON am.anonymous1_id = mq1.anonymous_id
		LEFT JOIN match_queue mq2 ON am.anonymous2_id = mq2.anonymous_id
		WHERE (am.user1_id = $1 OR am.user2_id = $1) AND am.ended_at IS NULL
		ORDER BY am.matched_at DESC
		LIMIT 1
	`

	err := h.db.Conn().QueryRow(matchQuery, userID).Scan(
		&match.ID, &match.Anonymous1ID, &match.Anonymous2ID,
		&partnerEphemeralKey, &partnerSignedPreKey, &partnerAnonymousID,
	)

	if err == sql.ErrNoRows {
		respondWithJSON(w, http.StatusOK, models.MatchStatusResponse{
			Matched: false,
		})
		return
	}

	if err != nil {
		respondWithError(w, http.StatusInternalServerError, "Failed to check match status")
		return
	}

	respondWithJSON(w, http.StatusOK, models.MatchStatusResponse{
		Matched:             true,
		MatchID:             &match.ID,
		PartnerAnonymousID:  &partnerAnonymousID,
		PartnerEphemeralKey: &partnerEphemeralKey,
		PartnerSignedPreKey: &partnerSignedPreKey,
	})
}

func (h *MatchHandler) LeaveQueue(w http.ResponseWriter, r *http.Request) {
	userID, ok := GetUserID(r)
	if !ok {
		respondWithError(w, http.StatusUnauthorized, "Unauthorized")
		return
	}

	query := `DELETE FROM match_queue WHERE user_id = $1`
	_, err := h.db.Conn().Exec(query, userID)
	if err != nil {
		respondWithError(w, http.StatusInternalServerError, "Failed to leave queue")
		return
	}

	respondWithJSON(w, http.StatusOK, map[string]string{
		"message": "Left matching queue",
	})
}

func (h *MatchHandler) findMatch(queueID, userID, anonymousID uuid.UUID, categoryTags []string) {
	// Simple matching algorithm: find another user with overlapping tags
	query := `
		SELECT id, user_id, anonymous_id, ephemeral_identity_key, ephemeral_signed_prekey
		FROM match_queue
		WHERE id != $1 
			AND category_tags && $2
			AND user_id IS NOT NULL
		ORDER BY joined_at
		LIMIT 1
	`

	var match models.MatchQueueEntry
	err := h.db.Conn().QueryRow(query, queueID, pq.Array(categoryTags)).Scan(
		&match.ID, &match.UserID, &match.AnonymousID,
		&match.EphemeralIdentityKey, &match.EphemeralSignedPreKey,
	)

	if err != nil {
		// No match found yet
		return
	}

	// Create active match
	insertMatch := `
		INSERT INTO active_matches (user1_id, user2_id, anonymous1_id, anonymous2_id)
		VALUES ($1, $2, $3, $4)
	`
	_, err = h.db.Conn().Exec(insertMatch, userID, match.UserID, anonymousID, match.AnonymousID)
	if err != nil {
		return
	}

	// Remove both from queue
	deleteQuery := `DELETE FROM match_queue WHERE id IN ($1, $2)`
	h.db.Conn().Exec(deleteQuery, queueID, match.ID)
}
