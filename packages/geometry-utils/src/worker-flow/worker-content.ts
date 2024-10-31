import { getBits } from '../helpers';
import { NestConfig } from '../types';

export default class WorkerContent {
    private _nestConfig: NestConfig;

    constructor(nestValue: number) {
        this._nestConfig = WorkerContent.deserializeConfig(nestValue);
    }

    protected get nestConfig(): NestConfig {
        return this._nestConfig;
    }

    private static deserializeConfig(value: number): NestConfig {
        return {
            curveTolerance: getBits(value, 0, 4) / 10,
            spacing: getBits(value, 4, 5),
            rotations: getBits(value, 9, 5),
            populationSize: getBits(value, 14, 7),
            mutationRate: getBits(value, 21, 7),
            useHoles: Boolean(getBits(value, 28, 1))
        };
    }
}
