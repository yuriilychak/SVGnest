//@ts-ignore
import { SvgNest } from 'polygon-packer'

import { REDUCER_ACTION, ReducerAction, ReducerMiddleware, ReducerState, SETTING_ID, SettingsData } from './types'
import { FILE_SAVER_ID } from './constants'

const REDUCER = new Map<REDUCER_ACTION, ReducerMiddleware>([
    [
        REDUCER_ACTION.INIT,
        prevState => ({
            ...prevState,
            svgNest: new SvgNest(),
            fileReader: new FileReader()
        })
    ],
    [
        REDUCER_ACTION.CHANGE_SETTINGS,
        (prevState, { id, value }: { id: SETTING_ID; value: string | boolean }) => {
            const { svgNest, isWorking } = prevState
            const settings: SettingsData = {
                ...prevState.settings,
                [id]: value
            }

            if (isWorking) {
                svgNest.stop()
            }

            svgNest.config(settings)

            return {
                ...prevState,
                settings,
                isWorking: false
            }
        }
    ],
    [
        REDUCER_ACTION.TOGGLE_DRAWER,
        (prevState, isDrawerOpen: boolean) => ({
            ...prevState,
            isDrawerOpen
        })
    ],
    [
        REDUCER_ACTION.UPDATE_SVG,
        (prevState, svgSrc: string) => ({
            ...prevState,
            svgSrc
        })
    ],
    [
        REDUCER_ACTION.DOWNLOAD_SVG,
        prevState => {
            const saver: HTMLLinkElement = document.getElementById(FILE_SAVER_ID) as HTMLLinkElement
            const blob = new Blob([prevState.svgSrc], { type: 'image/svg+xml;charset=utf-8' })
            const blobURL = (saver.href = URL.createObjectURL(blob)),
                body = document.body

            // @ts-ignore
            saver.download = 'SVGNestOutput.svg'

            saver.click()
            URL.revokeObjectURL(blobURL)

            return prevState
        }
    ],
    [
        REDUCER_ACTION.ZOOM_IN,
        prevState => ({
            ...prevState,
            scale: Math.min(prevState.scale + 0.2, 4)
        })
    ],
    [
        REDUCER_ACTION.ZOOM_OUT,
        prevState => ({
            ...prevState,
            scale: Math.max(prevState.scale - 0.2, 0.2)
        })
    ]
])

export default function (prevState: ReducerState, { type, payload }: ReducerAction) {
    return REDUCER.has(type) ? REDUCER.get(type)(prevState, payload) : prevState
}
