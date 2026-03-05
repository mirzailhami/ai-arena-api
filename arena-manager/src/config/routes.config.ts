/**
 * Route IDs and root path for the arena-manager app.
 */
import { AppSubdomain, EnvironmentConfig } from '~/config'

export const rootRoute: string =
    EnvironmentConfig.SUBDOMAIN === AppSubdomain.arenaManager
        ? ''
        : `/${AppSubdomain.arenaManager}`

export const problemLibraryRouteId = 'problem-library'
