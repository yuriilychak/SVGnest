// @ts-nocheck
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { loadSvgFormatPlugin } from '@svgnest/svg-format-plugin';
import { PolygonPack } from '@svgnest/polygon-pack';
import demoSvg from '../demo.svg?raw';
import { DEFAULT_SETTING, INITIAL_NESTING_STATISTICS, MAX_ZOOM, MIN_ZOOM, ZOOM_STEP } from './constants';
import { getModifiedButtons, toPercents } from './helpers';
import { MESSAGE_ID } from './types';
import { BUTTON_ACTION } from '../types';

function toSvgElement(markup: string): SVGElement {
    const document = new DOMParser().parseFromString(markup, 'image/svg+xml');
    const svg = document.documentElement;
    if (!svg || svg.tagName.toLowerCase() !== 'svg' || document.querySelector('parsererror')) {
        throw new Error('Plugin returned invalid SVG display data');
    }
    return svg as unknown as SVGElement;
}

export default function useAppFlow(onClose: () => void, isDemoMode: boolean) {
    const plugin = useRef(loadSvgFormatPlugin()).current;
    const nest = useRef(new PolygonPack()).current;
    const fileLoader = useRef<HTMLInputElement>(null);
    const svgWrapper = useRef<HTMLDivElement>(null);
    const sourceInput = useRef('');
    const sourceElements = useRef<SVGElement[]>([]);
    const partPolygons = useRef([]);
    const outputDocuments = useRef<string[]>([]);
    const binIndex = useRef<number | null>(null);
    const configRef = useRef(DEFAULT_SETTING);
    const loadId = useRef(0);
    const [settings, setSettings] = useState(DEFAULT_SETTING);
    const [isDrawerOpen, setDrawerOpen] = useState(false);
    const [isWorking, setWorking] = useState(false);
    const [svgSrc, setSvgSrc] = useState('');
    const [scale, setScale] = useState(1);
    const [progress, setProgress] = useState(0);
    const [estimate, setEstimate] = useState(0);
    const [iterations, setIterations] = useState(0);
    const [nestingStatistics, setStatistics] = useState(INITIAL_NESTING_STATISTICS);
    const [isBinSelected, setBinSelected] = useState(false);
    const [message, setMessage] = useState('');
    const [messageId, setMessageId] = useState(MESSAGE_ID.UPLOAD);
    const startedAt = useRef(0);

    useEffect(() => () => nest.stop(), [nest]);
    const selectBin = useCallback((source: number) => {
        if (!partPolygons.current.some(polygon => polygon.source === source)) return;
        nest.stop();
        sourceElements.current.forEach(element => element.removeAttribute('id'));
        sourceElements.current[source]?.setAttribute('id', 'selectedElement');
        binIndex.current = source;
        setBinSelected(true); setWorking(false);
    }, [nest]);
    const loadSvg = useCallback(async (text: string) => {
        const requestId = ++loadId.current;
        try {
            nest.stop();
            const svgPlugin = await plugin;
            const config = { curveTolerance: configRef.current.curveTolerance };
            const [preview, polygons] = await Promise.all([
                svgPlugin.inputToSvg(text, config),
                svgPlugin.inputToPolygons(text, config)
            ]);
            if (requestId !== loadId.current) return;
            const svg = toSvgElement(preview.value);
            const elements = Array.from(svg.children) as SVGElement[];
            const elementsBySource: SVGElement[] = [];
            elements.forEach(element => {
                const source = Number(element.getAttribute('data-svgnest-source'));
                if (!Number.isSafeInteger(source) || source < 0) return;
                elementsBySource[source] = element;
                element.addEventListener('click', event => { event.stopPropagation(); selectBin(source); });
            });
            sourceInput.current = text;
            sourceElements.current = elementsBySource;
            partPolygons.current = polygons.value.polygons;
            outputDocuments.current = [preview.value];
            binIndex.current = null;
            svgWrapper.current?.replaceChildren(svg);
            setSvgSrc(text); setBinSelected(false); setWorking(false); setProgress(0); setIterations(0);
            setEstimate(0); setStatistics(INITIAL_NESTING_STATISTICS); setMessageId(MESSAGE_ID.UPLOAD);
        } catch (error) {
            if (requestId === loadId.current) {
                setMessage(String(error));
                setMessageId(MESSAGE_ID.ERROR);
            }
        }
    }, [nest, plugin, selectBin]);
    const start = useCallback(() => {
        if (binIndex.current === null) return;
        startedAt.current = Date.now();
        const binSource = binIndex.current;
        const started = nest.start(configRef.current, partPolygons.current, binSource, value => {
            if (value > 0.02) setEstimate(((Date.now() - startedAt.current) / value) * (1 - value));
            setProgress(toPercents(value));
        }, async (best = null) => {
            setIterations(value => value + 1);
            if (!best) return;
            const context = nest.placementContext;
            if (!context) return;
            try {
                const svgPlugin = await plugin;
                const output = await svgPlugin.outputToSvg(sourceInput.current, {
                    placements: best.placements,
                    tree: context.tree,
                    binBounds: context.binBounds,
                    binSource
                });
                if (output.value.documents.length) {
                    outputDocuments.current = output.value.documents;
                    svgWrapper.current?.replaceChildren(...output.value.documents.map(toSvgElement));
                }
                setStatistics({ efficiency: best.placedArea / best.totalArea, placed: best.placedCount, total: best.partCount });
                setMessageId(MESSAGE_ID.COMPLETED);
            } catch (error) {
                setMessage(String(error));
                setMessageId(MESSAGE_ID.ERROR);
            }
        });
        setWorking(Boolean(started)); if (started) setMessageId(MESSAGE_ID.START);
    }, [nest, plugin]);
    const stop = useCallback(() => { nest.stop(); setWorking(false); }, [nest]);
    const download = useCallback(() => {
        const svgDocument = outputDocuments.current[0];
        if (!svgDocument) return;
        const url = URL.createObjectURL(new Blob([svgDocument], { type: 'image/svg+xml;charset=utf-8' }));
        const link = document.createElement('a'); link.href = url; link.download = 'SVGNestOutput.svg'; link.click(); URL.revokeObjectURL(url);
    }, []);
    const handleClick = useCallback((action: BUTTON_ACTION) => {
        if (action === BUTTON_ACTION.START) start(); else if (action === BUTTON_ACTION.PAUSE) stop();
        else if (action === BUTTON_ACTION.UPLOAD) fileLoader.current?.click(); else if (action === BUTTON_ACTION.DOWNLOAD) download();
        else if (action === BUTTON_ACTION.SETTINGS) setDrawerOpen(true); else if (action === BUTTON_ACTION.CLOSE_SETTINGS) setDrawerOpen(false);
        else if (action === BUTTON_ACTION.ZOOM_IN) setScale(value => Math.min(value + ZOOM_STEP, MAX_ZOOM));
        else if (action === BUTTON_ACTION.ZOOM_OUT) setScale(value => Math.max(value - ZOOM_STEP, MIN_ZOOM));
        else if (action === BUTTON_ACTION.BACK) { stop(); onClose(); }
    }, [download, onClose, start, stop]);
    const handleChangeSettings = useCallback((value, id) => {
        stop();
        const next = { ...settings, [id]: value };
        configRef.current = next;
        setSettings(next);
    }, [settings, stop]);
    const handleUploadSvg = useCallback(event => { const file = event.target.files?.[0]; if (!file) return; const reader = new FileReader(); reader.onload = () => void loadSvg(String(reader.result)); reader.readAsText(file); event.target.value = ''; }, [loadSvg]);
    useEffect(() => { if (isDemoMode) void loadSvg(demoSvg); }, [isDemoMode, loadSvg]);
    const zoomStyles = useMemo(() => ({ width: `${Math.floor(scale * 100)}%` }), [scale]);
    const { disabledButtons, hiddenButtons } = useMemo(() => getModifiedButtons(isWorking, isBinSelected, iterations, svgSrc), [isWorking, isBinSelected, iterations, svgSrc]);
    return { handleClick, handleChangeSettings, handleUploadSvg, zoomStyles, fileLoader, svgWrapper, isDrawerOpen, isWorking, progress, nestingStatistics, estimate, iterations, settings, disabledButtons, hiddenButtons, message, messageId };
}
