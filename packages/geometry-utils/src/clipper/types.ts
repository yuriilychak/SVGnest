export enum POLY_FILL_TYPE {
    NON_ZERO = 1,
    POSITIVE = 2,
    NEGATIVE = 3
}

export enum POLY_TYPE {
    SUBJECT = 0,
    CLIP = 1
}

export enum CLIP_TYPE {
    UNION = 1,
    DIFFERENCE = 2
}

export enum DIRECTION {
    LEFT = 0,
    RIGHT = 1
}

export type NullPtr<T> = T | null;
