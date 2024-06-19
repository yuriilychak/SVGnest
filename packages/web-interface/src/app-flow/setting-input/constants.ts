import { INPUT_TYPE } from '../types'
import { TypeConfig } from './types'

const getTypeConfig = (
    labelPlacement: 'end' | 'top',
    alignItems: string,
    paddingTop: number,
    input: object = {}
): TypeConfig => ({
    labelPlacement,
    styles: {
        root: { margin: 0, alignItems },
        helpText: { marginX: 0, lineHeight: 1, paddingTop, textAlign: 'justify' },
        input
    }
})

export const TYPE_CONFIG = new Map<INPUT_TYPE, TypeConfig>([
    [INPUT_TYPE.BOOLEAN, getTypeConfig('end', 'center', 0)],
    [INPUT_TYPE.NUMBER, getTypeConfig('top', 'start', 1, { marginX: 1, width: 'calc(100% - 16px)', boxSizing: 'border-box' })]
])
