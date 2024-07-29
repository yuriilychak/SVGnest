import { ChangeEvent, useCallback, useEffect, useMemo, useReducer, useRef } from 'react';

import { INITIAL_STATE, VIEW_BOX_ATTRIBUTES } from './constants';
import reducer from './reducer';
import { BUTTON_ACTION, PREDEFINED_ID, REDUCER_ACTION, SETTING_ID } from './types';
import { getModifiedButtons, getZoomStyles } from './helpers';

export default function useAppFlow(onClose: () => void, isDemoMode: boolean) {
    const [state, dispatch] = useReducer(reducer, INITIAL_STATE);
    const fileLoader = useRef<HTMLInputElement>(null);
    const svgWrapper = useRef<HTMLDivElement>(null);
    const currentBin = useRef<SVGElement>(null);

    const {
        fileReader,
        isDrawerOpen,
        settings,
        svgSrc,
        scale,
        isWorking,
        polygonPacker,
        progress,
        nestingStatistics,
        estimate,
        iterations,
        isBinSelected,
        message,
        messageId
    } = state;

    const handleDispatch = useCallback((type: REDUCER_ACTION, payload?: unknown) => dispatch({ type, payload }), [dispatch]);

    const handleLoadFile = useCallback(
        (event: ProgressEvent<FileReader>) => handleDispatch(REDUCER_ACTION.UPDATE_SVG, event.target.result),
        [handleDispatch]
    );

    const handleUpdateBin = useCallback(
        (element: SVGElement) => {
            if (currentBin.current) {
                currentBin.current.setAttribute('id', null);
            }

            currentBin.current = element;
            currentBin.current.setAttribute('id', PREDEFINED_ID.SELECTED_ELEMENT);
            polygonPacker.setBin(currentBin.current);
            handleDispatch(REDUCER_ACTION.SELECT_BIN);
        },
        [handleDispatch, polygonPacker]
    );

    const handleLoadExample = useCallback(async () => {
        try {
            const response = await fetch('assets/demo.svg');
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const svgText = await response.text();
            handleDispatch(REDUCER_ACTION.UPDATE_SVG, svgText);
        } catch (error) {
            handleDispatch(REDUCER_ACTION.THROW_ERROR, error);
        }
    }, [handleDispatch]);

    const handleBinClick = useCallback((event: MouseEvent) => handleUpdateBin(event.target as SVGElement), [handleUpdateBin]);

    useEffect(() => () => polygonPacker.stop(), [polygonPacker]);

    useEffect(() => {
        if (svgSrc) {
            try {
                const { source, attributes } = polygonPacker.parseSvg(svgSrc) as {
                    source: string;
                    attributes: { [key: string]: string };
                };
                const div = document.createElement('div');

                div.innerHTML = source;

                const svg: SVGElement = div.firstChild as SVGElement;
                const wholeSVG = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
                const rect = document.createElementNS(wholeSVG.namespaceURI, 'rect') as SVGElement;
                // Copy relevant scaling info
                wholeSVG.setAttribute('width', attributes.width);
                wholeSVG.setAttribute('height', attributes.height);
                wholeSVG.setAttribute('viewBox', attributes.viewBox);

                const viewBox = wholeSVG.viewBox;

                VIEW_BOX_ATTRIBUTES.forEach(attribute => {
                    rect.setAttribute(attribute, viewBox.baseVal[attribute].toString());
                });
                rect.setAttribute('id', PREDEFINED_ID.BACKGROUND_RECT);
                wholeSVG.appendChild(rect);
                handleUpdateBin(rect);
                svgWrapper.current.innerHTML = '';
                svgWrapper.current.appendChild(wholeSVG); // As a default bin in background
                svgWrapper.current.appendChild(svg);

                const nodeCount = svg.childNodes.length;
                let node: SVGElement = null;
                let i: number = 0;
                // attach event listeners
                for (i = 0; i < nodeCount; ++i) {
                    node = svg.childNodes[i] as SVGElement;
                    if (node.nodeType === 1) {
                        node.onclick = handleBinClick;
                    }
                }
            } catch (error) {
                handleDispatch(REDUCER_ACTION.THROW_ERROR, error);
            }
        }
    }, [polygonPacker, svgSrc, handleBinClick, handleUpdateBin]);

    useEffect(() => {
        if (fileReader !== null) {
            fileReader.onload = handleLoadFile;
        }
    }, [fileReader, handleLoadFile]);

    useEffect(() => {
        if (isDemoMode) {
            void handleLoadExample();
        }
    }, [isDemoMode, handleLoadExample]);

    const handleProgress = useCallback((percent: number) => handleDispatch(REDUCER_ACTION.PROGRESS, percent), [handleDispatch]);

    const handleRenderSvg = useCallback(
        (svgList: string, efficiency: number, placed: number, total: number) => {
            if (svgList) {
                handleDispatch(REDUCER_ACTION.UPDATE_STATISTICS, { efficiency, placed, total });
                svgWrapper.current.innerHTML = svgList;
            } else {
                handleDispatch(REDUCER_ACTION.NEW_ITERATION);
            }
        },
        [handleDispatch]
    );

    const handleClick = useCallback(
        (action: string) => {
            switch (action as BUTTON_ACTION) {
                case BUTTON_ACTION.START:
                    handleDispatch(REDUCER_ACTION.START_NESTING);

                    return polygonPacker.start(handleProgress, handleRenderSvg);
                case BUTTON_ACTION.PAUSE:
                    return handleDispatch(REDUCER_ACTION.PAUSE_NESTING);
                case BUTTON_ACTION.BACK:
                    return onClose();
                case BUTTON_ACTION.UPLOAD:
                    return fileLoader.current.click();
                case BUTTON_ACTION.DOWNLOAD:
                    return handleDispatch(REDUCER_ACTION.DOWNLOAD_SVG);
                case BUTTON_ACTION.SETTINGS:
                case BUTTON_ACTION.CLOSE_SETTINGS:
                    return handleDispatch(REDUCER_ACTION.TOGGLE_DRAWER, (action as BUTTON_ACTION) === BUTTON_ACTION.SETTINGS);
                case BUTTON_ACTION.ZOOM_IN:
                    return handleDispatch(REDUCER_ACTION.ZOOM_IN);
                case BUTTON_ACTION.ZOOM_OUT:
                    return handleDispatch(REDUCER_ACTION.ZOOM_OUT);
                default:
                    return null;
            }
        },
        [onClose, handleDispatch, polygonPacker, handleProgress, handleRenderSvg]
    );

    const handleChangeSettings = useCallback(
        (value: boolean | number, id: SETTING_ID) => handleDispatch(REDUCER_ACTION.CHANGE_SETTINGS, { value, id }),
        [handleDispatch]
    );

    const handleUploadSvg = useCallback(
        (event: ChangeEvent<HTMLInputElement>) => {
            const file: File = event.target.files[0];

            fileReader.readAsText(file);
        },
        [fileReader]
    );

    const zoomStyles = useMemo(() => getZoomStyles(scale), [scale]);
    const { disabledButtons, hiddenButtons } = useMemo(
        () => getModifiedButtons(isWorking, isBinSelected, iterations, svgSrc),
        [isWorking, iterations, isBinSelected, svgSrc]
    );

    return {
        handleClick,
        handleChangeSettings,
        handleUploadSvg,
        zoomStyles,
        fileLoader,
        svgWrapper,
        isDrawerOpen,
        isWorking,
        progress,
        nestingStatistics,
        estimate,
        iterations,
        settings,
        disabledButtons,
        hiddenButtons,
        message,
        messageId
    };
}
