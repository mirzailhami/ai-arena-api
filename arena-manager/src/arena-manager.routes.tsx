import { AppSubdomain, EnvironmentConfig, ToolTitle } from '~/config'
import {
    lazyLoad,
    LazyLoadedComponent,
    PlatformRoute,
    Rewrite,
} from '~/libs/core'

import {
    problemLibraryRouteId,
    rootRoute,
} from './config/routes.config'

const ArenaManagerApp: LazyLoadedComponent = lazyLoad(
    () => import('./ArenaManagerApp'),
)

const ProblemLibraryPage: LazyLoadedComponent = lazyLoad(
    () => import('./problem-library/ProblemLibraryPage'),
    'ProblemLibraryPage',
)

export const toolTitle: string = ToolTitle.arenaManager

export const arenaManagerRoutes: ReadonlyArray<PlatformRoute> = [
    {
        authRequired: EnvironmentConfig.ENV !== 'local',
        children: [
            {
                element: <Rewrite to={problemLibraryRouteId} />,
                route: '',
            },
            {
                element: <ProblemLibraryPage />,
                id: problemLibraryRouteId,
                route: problemLibraryRouteId,
                title: 'Problem Library',
            },
        ],
        domain: AppSubdomain.arenaManager,
        element: <ArenaManagerApp />,
        id: toolTitle,
        route: rootRoute,
        title: toolTitle,
    },
]
