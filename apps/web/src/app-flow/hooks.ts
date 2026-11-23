// @ts-nocheck
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { PolygonPack } from '@svgnest/polygon-pack';
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
    const pluginLoaders = useRef({ svg: null, ai: null, dxf: null });
    const plugin = useRef(null);
    const nest = useRef(new PolygonPack()).current;
    const fileLoader = useRef<HTMLInputElement>(null);
    const svgWrapper = useRef<HTMLDivElement>(null);
    const sourceInput = useRef('');
    const sourceElements = useRef<SVGElement[]>([]);
    const partPolygons = useRef([]);
    const outputDocuments = useRef<string[]>([]);
    const outputAiData = useRef<Uint8Array | null>(null);
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

    const loadSvgPlugin = useCallback(() => {
        pluginLoaders.current.svg ??= import('@svgnest/svg-format-plugin').then(({ loadSvgFormatPlugin }) => loadSvgFormatPlugin());
        return pluginLoaders.current.svg;
    }, []);
    const loadAiPlugin = useCallback(() => {
        pluginLoaders.current.ai ??= import('@svgnest/ai-format-plugin').then(({ loadAiFormatPlugin }) => loadAiFormatPlugin());
        return pluginLoaders.current.ai;
    }, []);
    const loadDxfPlugin = useCallback(() => {
        pluginLoaders.current.dxf ??= import('@svgnest/dxf-format-plugin').then(({ loadDxfFormatPlugin }) => loadDxfFormatPlugin());
        return pluginLoaders.current.dxf;
    }, []);

    useEffect(() => () => nest.stop(), [nest]);
    const selectBin = useCallback((source: number) => {
        if (!partPolygons.current.some(polygon => polygon.source === source)) return;
        nest.stop();
        sourceElements.current.forEach(element => element.removeAttribute('id'));
        sourceElements.current[source]?.setAttribute('id', 'selectedElement');
        binIndex.current = source;
        setBinSelected(true); setWorking(false);
    }, [nest]);
    const loadSvg = useCallback(async (text: string | Uint8Array, nextPlugin) => {
        const requestId = ++loadId.current;
        try {
            nest.stop();
            const formatPlugin = await nextPlugin;
            const config = { curveTolerance: configRef.current.curveTolerance };
            const [preview, polygons] = await Promise.all([
                formatPlugin.inputToSvg(text, config),
                formatPlugin.inputToPolygons(text, config)
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
            plugin.current = nextPlugin;
            sourceInput.current = text;
            sourceElements.current = elementsBySource;
            partPolygons.current = polygons.value.polygons;
            outputDocuments.current = [preview.value];
            outputAiData.current = null;
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
    }, [nest, selectBin]);
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
                const formatPlugin = await plugin.current;
                const output = await formatPlugin.outputToSvg(sourceInput.current, {
                    placements: best.placements,
                    tree: context.tree,
                    binBounds: context.binBounds,
                    binSource
                });
                if (output.value.documents.length) {
                    outputDocuments.current = output.value.documents;
                    outputAiData.current = formatPlugin.id === 'ai'
                        ? (await formatPlugin.outputToData(sourceInput.current, {
                            placements: best.placements,
                            tree: context.tree,
                            binBounds: context.binBounds,
                            binSource
                        })).value
                        : null;
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
    }, [nest]);
    const stop = useCallback(() => { nest.stop(); setWorking(false); }, [nest]);
    const download = useCallback(() => {
        if (outputAiData.current) {
            const url = URL.createObjectURL(new Blob([outputAiData.current], { type: 'application/illustrator' }));
            const link = document.createElement('a'); link.href = url; link.download = 'VectorNestOutput.ai'; link.click(); URL.revokeObjectURL(url);
            return;
        }
        const svgDocument = outputDocuments.current[0];
        if (!svgDocument) return;
        const url = URL.createObjectURL(new Blob([svgDocument], { type: 'image/svg+xml;charset=utf-8' }));
        const link = document.createElement('a'); link.href = url; link.download = 'VectorNestOutput.svg'; link.click(); URL.revokeObjectURL(url);
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
    const handleUploadSvg = useCallback(event => { const file = event.target.files?.[0]; if (!file) return; const reader = new FileReader(); const extension = file.name.toLowerCase().split('.').pop(); const isAi = extension === 'ai'; const isDxf = extension === 'dxf'; const nextPlugin = isAi ? loadAiPlugin() : isDxf ? loadDxfPlugin() : loadSvgPlugin(); reader.onload = () => void loadSvg(isAi ? new Uint8Array(reader.result as ArrayBuffer) : String(reader.result), nextPlugin); if (isAi) reader.readAsArrayBuffer(file); else reader.readAsText(file); event.target.value = ''; }, [loadAiPlugin, loadDxfPlugin, loadSvg, loadSvgPlugin]);
    useEffect(() => {
        if (!isDemoMode) return;
        const controller = new AbortController();
        void fetch(new URL('demo.svg', document.baseURI), { signal: controller.signal })
            .then(response => {
                if (!response.ok) throw new Error(`Failed to load demo SVG: ${response.status} ${response.statusText}`);
                return response.text();
            })
            .then(text => loadSvg(text, loadSvgPlugin()))
            .catch(error => {
                if (error.name === 'AbortError') return;
                setMessage(String(error));
                setMessageId(MESSAGE_ID.ERROR);
            });
        return () => controller.abort();
    }, [isDemoMode, loadSvg, loadSvgPlugin]);
    const zoomStyles = useMemo(() => ({ width: `${Math.floor(scale * 100)}%` }), [scale]);
    const { disabledButtons, hiddenButtons } = useMemo(() => getModifiedButtons(isWorking, isBinSelected, iterations, svgSrc), [isWorking, isBinSelected, iterations, svgSrc]);
    return { handleClick, handleChangeSettings, handleUploadSvg, zoomStyles, fileLoader, svgWrapper, isDrawerOpen, isWorking, progress, nestingStatistics, estimate, iterations, settings, disabledButtons, hiddenButtons, message, messageId };
}
