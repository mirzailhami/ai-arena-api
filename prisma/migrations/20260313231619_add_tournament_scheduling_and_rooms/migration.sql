-- CreateEnum
CREATE TYPE "TournamentStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'IN_PROGRESS', 'COMPLETED');

-- CreateEnum
CREATE TYPE "RoomStatus" AS ENUM ('PENDING', 'DEPLOYING', 'RUNNING', 'STOPPING', 'STOPPED', 'FAILED');

-- AlterTable
ALTER TABLE "tournaments" ADD COLUMN     "intermissionMinutes" INTEGER NOT NULL DEFAULT 15,
ADD COLUMN     "publishedAt" TIMESTAMP(3),
ADD COLUMN     "roundDurationMinutes" INTEGER NOT NULL DEFAULT 60,
ADD COLUMN     "status" "TournamentStatus" NOT NULL DEFAULT 'DRAFT';

-- CreateTable
CREATE TABLE "rooms" (
    "id" TEXT NOT NULL,
    "tournamentId" TEXT NOT NULL,
    "roundNumber" INTEGER NOT NULL,
    "contestId" TEXT NOT NULL,
    "roomName" TEXT NOT NULL,
    "url" TEXT,
    "status" "RoomStatus" NOT NULL DEFAULT 'PENDING',
    "taskArn" TEXT,
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "deployedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rooms_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "rooms" ADD CONSTRAINT "rooms_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "tournaments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
