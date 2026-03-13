CREATE TABLE "problems" (
    "id" TEXT NOT NULL,
    "problemName" TEXT NOT NULL,
    "zipFileName" TEXT NOT NULL,
    "description" TEXT,
    "status" TEXT NOT NULL DEFAULT 'Pending Test',
    "isContestReady" BOOLEAN NOT NULL DEFAULT false,
    "isTested" BOOLEAN NOT NULL DEFAULT false,
    "buildLog" TEXT,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "problems_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "tournaments" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "numRounds" INTEGER NOT NULL,
    "initialEntrants" INTEGER NOT NULL,
    "maxContestantsPerMatch" INTEGER NOT NULL,
    "advancingContestants" INTEGER NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "bracketJson" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tournaments_pkey" PRIMARY KEY ("id")
);
