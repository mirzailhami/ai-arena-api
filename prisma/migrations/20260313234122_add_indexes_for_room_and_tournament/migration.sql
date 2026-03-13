-- CreateIndex
CREATE INDEX "rooms_status_scheduledAt_idx" ON "rooms"("status", "scheduledAt");

-- CreateIndex
CREATE INDEX "rooms_status_expiresAt_idx" ON "rooms"("status", "expiresAt");

-- CreateIndex
CREATE INDEX "rooms_tournamentId_idx" ON "rooms"("tournamentId");

-- CreateIndex
CREATE INDEX "tournaments_status_idx" ON "tournaments"("status");
