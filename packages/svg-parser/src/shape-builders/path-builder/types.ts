import { IPoint } from '../../types';

export interface IBasicSegmentData {
    point1: IPoint
    point2: IPoint
}

export interface IQuadraticSegmentData extends IBasicSegmentData {
    control: IPoint
}

export interface ICubicSegmentData extends IBasicSegmentData {
    control1: IPoint
    control2: IPoint
}

export interface IArcSegmentData extends IBasicSegmentData {
    rx: number
    ry: number
    angle: number
    largeArc: number
    sweep: number
}

export interface IArcSegmentConfig extends IBasicSegmentData {
    center: IPoint
    radius: IPoint
    theta: number
    extent: number
    angle: number
}
