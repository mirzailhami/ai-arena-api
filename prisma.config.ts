import { loadEnvFile } from 'node:process'
import { defineConfig } from 'prisma/config'

try {
    loadEnvFile()
} catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error
    }
}

export default defineConfig({
    datasource: {
        url: process.env.DATABASE_URL,
    },
    migrations: {
        path: 'prisma/migrations',
    },
    schema: 'prisma/schema.prisma',
})
