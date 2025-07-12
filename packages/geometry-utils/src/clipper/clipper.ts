import { PointI32 } from '../geometry';
import JoinManager from './join-manager';
import OutRecManager from './out-rec-manager';
import Scanbeam from './scanbeam';
import TEdgeManager from './t-edge-manager';
import { CLIP_TYPE, POLY_FILL_TYPE, POLY_TYPE } from './types';

export default class Clipper {
    private scanbeam: Scanbeam;
    private tEdgeManager: TEdgeManager;
    private isExecuteLocked: boolean = false;
    private joinManager: JoinManager;
    private outRecManager: OutRecManager;
    public ReverseSolution: boolean = false;
    public StrictlySimple: boolean = false;

    constructor() {
        this.outRecManager = new OutRecManager();
        this.scanbeam = new Scanbeam();
        this.outRecManager = new OutRecManager();
        this.joinManager = new JoinManager(this.outRecManager);
        this.tEdgeManager = new TEdgeManager(this.scanbeam, this.joinManager, this.outRecManager);
    }

    public addPath(polygon: PointI32[], polyType: POLY_TYPE): boolean {
        return this.tEdgeManager.addPath(polygon, polyType);
    }

    public addPaths(polygons: PointI32[][], polyType: POLY_TYPE): boolean {
        //  console.log("-------------------------------------------");
        //  console.log(JSON.stringify(ppg));
        const polygonCount: number = polygons.length;
        let result: boolean = false;
        let i: number = 0;

        for (i = 0; i < polygonCount; ++i) {
            if (this.addPath(polygons[i], polyType)) {
                result = true;
            }
        }

        return result;
    }

    public execute(clipType: CLIP_TYPE, solution: PointI32[][], fillType: POLY_FILL_TYPE): boolean {
        if (this.isExecuteLocked) {
            return false;
        }

        this.isExecuteLocked = true;
        this.joinManager.init(clipType, fillType, this.tEdgeManager.isUseFullRange);
        this.tEdgeManager.init(clipType, fillType);

        solution.length = 0;

        let succeeded: boolean = false;

        try {
            succeeded = this.executeInternal();
            //build the return polygons ...
            if (succeeded) {
                this.outRecManager.buildResult(solution);
            }
        } finally {
            this.outRecManager.dispose();
            this.isExecuteLocked = false;
        }

        return succeeded;
    }

    private executeInternal(): boolean {
        try {
            this.reset();

            if (this.tEdgeManager.isMinimaEmpty) {
                return false;
            }

            let botY: number = this.scanbeam.pop();
            let topY: number = 0;

            do {
                this.tEdgeManager.insertLocalMinimaIntoAEL(botY);
                this.joinManager.clearGhostJoins();
                this.tEdgeManager.processHorizontals(false);

                if (this.scanbeam.isEmpty) {
                    break;
                }

                topY = this.scanbeam.pop();
                //console.log("botY:" + botY + ", topY:" + topY);
                if (!this.tEdgeManager.processIntersections(botY, topY)) {
                    return false;
                }

                this.tEdgeManager.processEdgesAtTopOfScanbeam(topY, this.StrictlySimple);

                botY = topY;
            } while (!this.scanbeam.isEmpty || !this.tEdgeManager.isMinimaEmpty);
            //fix orientations ...
            this.outRecManager.fixOrientation(this.ReverseSolution);
            this.joinManager.joinCommonEdges(this.ReverseSolution);

            this.outRecManager.fixupOutPolygon(this.tEdgeManager.isUseFullRange);

            if (this.StrictlySimple) {
                this.outRecManager.doSimplePolygons();
            }

            return true;
        } finally {
            this.joinManager.reset();
        }
    }

    protected reset(): void {
        this.tEdgeManager.reset();
    }
}
