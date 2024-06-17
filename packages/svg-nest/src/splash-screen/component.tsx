import { useCallback, useState, useLayoutEffect, memo } from 'react'

import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import Drawer from '@mui/material/Drawer'

import { HelpItem } from './help-item'
import { Logo } from './logo'
import { ButtonGroup } from '../shared'
import { BUTTON_CONFIG } from './constants'
import { BUTTON_ACTIONS } from './types'

const SplashScreen = ({ onOpenApp }: { onOpenApp: (isLoadFile: boolean) => void }) => {
    const [isDrawerOpen, setDrawerOpen] = useState(false)
    const [isDrawerHorizontal, setDrawerHorizontal] = useState(true)
    const handleCloseDrawer = useCallback(() => setDrawerOpen(false), [])
    const handleResize = useCallback(() => setDrawerHorizontal(window.innerWidth > window.innerHeight), [])

    const handleAction = useCallback(
        (action: string) => {
            switch (action) {
                case BUTTON_ACTIONS.DEMO:
                case BUTTON_ACTIONS.START:
                    onOpenApp(action === BUTTON_ACTIONS.START)
                    break
                case BUTTON_ACTIONS.GITHUB:
                    window.open('https://github.com/Jack000/SVGnest', '_blank')
                    break
                default:
                    setDrawerOpen(true)
            }
        },
        [onOpenApp]
    )

    useLayoutEffect(() => {
        window.addEventListener('resize', handleResize)
        handleResize()

        return () => window.removeEventListener('resize', handleResize)
    }, [])

    return (
        <Stack
            sx={{ width: '100vw', height: '100vh', alignItems: 'center', justifyContent: 'center' }}
            gap={{ xs: 0.5, sm: 1 }}
            paddingX={{ xs: 1, sm: 2 }}
            boxSizing='border-box'
        >
            <Logo />
            <Typography sx={{ typography: { md: 'h4', xs: 'h5' } }}>SVGnest</Typography>
            <Typography sx={{ typography: { md: 'h5', xs: 'body1' } }}>Open Source nesting</Typography>
            <ButtonGroup buttonsConfig={BUTTON_CONFIG} onClick={handleAction} />
            <Drawer open={isDrawerOpen} onClose={handleCloseDrawer} anchor={isDrawerHorizontal ? 'right' : 'bottom'}>
                <Stack
                    boxSizing='border-box'
                    width={isDrawerHorizontal ? '50vw' : '100vw'}
                    height={isDrawerHorizontal ? '100vh' : '50vh'}
                    gap={2}
                    paddingY={2}
                    paddingX={3}
                >
                    <HelpItem title="What exactly is 'nesting'?">
                        If you have some parts to cut out of a piece of metal/plastic/wood etc, you'd want to arrange the parts
                        to use as little material as possible. This is a common problem if you use a laser cutter, plasma
                        cutter, or CNC machine.In computer terms this is called the irregular bin-packing problem
                    </HelpItem>
                    <HelpItem title='How much does it cost?'>
                        <p>
                            It's free and open source. The code and implementation details are on
                            <a href='https://github.com/Jack000/SVGnest' target='_blank'>
                                Github
                            </a>
                        </p>
                    </HelpItem>
                    <HelpItem title='Does it use inches? mm?'>
                        SVG has its internal units, the distance related fields in the settings use SVG units, ie. pixels. The
                        conversion between a pixel and real units depend on the exporting software, but it's typically 72 pixels
                        = 1 inch
                    </HelpItem>
                    <HelpItem title="My SVG text/image doesn't show up?">
                        Nesting only works for closed shapes, so SVG elements that don't represent closed shapes are removed.
                        Convert text and any other elements to outlines first. Ensure that outlines do not intersect or overlap
                        eachother. Outlines that are inside other outlines are considered holes.
                    </HelpItem>
                    <HelpItem title="It doesn't ever stop?">
                        The software will continuously look for better solutions until you press the stop button. You can stop
                        at any time and download the SVG file.
                    </HelpItem>
                    <HelpItem title='Some parts seem to slightly overlap?'>
                        Curved shapes are approximated with line segments. For a more accurate nest with curved parts, decrease
                        the curve tolerance parameter in the configuration.
                    </HelpItem>
                    <HelpItem title='I need help?'>
                        <p>
                            Add an issue on Github or contact me personally: <a href='http://jack.works'>jack.works</a>
                        </p>
                    </HelpItem>
                </Stack>
            </Drawer>
        </Stack>
    )
}

export default memo(SplashScreen)
