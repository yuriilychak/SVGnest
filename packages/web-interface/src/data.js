import { SvgNest } from 'polygon-packer'

import { millisecondsToStr } from './helpers'

// UI-specific stuff, button clicks go here
const svgNest = new SvgNest()

export function triggerLogic() {
    // FAQ toggle
    const message = document.getElementById('message')
    const demo = document.getElementById('demo')

    demo.onclick = function () {
        try {
            const display = document.getElementById('select')
            const svg = svgNest.parseSvg(display.innerHTML)
            display.innerHTML = ''
            display.appendChild(svg)
        } catch (e) {
            message.innerHTML = e
            message.className = 'error animated bounce'

            return
        }

        message.innerHTML = 'Click on the outline to use as the bin'
        message.className = 'active animated bounce'

        attachSvgListeners(svg)
    }

    // button clicks
    const start = document.getElementById('start')
    const download = document.getElementById('download')
    const startLabel = document.getElementById('startLabel')
    const fileInput = document.getElementById('fileinput')

    const config = document.getElementById('config')
    const configButton = document.getElementById('configButton')

    const zoomIn = document.getElementById('zoomInButton')
    const zoomOut = document.getElementById('zoomOutButton')

    let isWorking = false

    start.onclick = function () {
        if (this.className == 'button start disabled') {
            return false
        }
        iterations = 0
        if (isWorking) {
            stopNest()
        } else {
            startNest()
        }

        display.className = 'disabled'
        document.getElementById('info_time').setAttribute('style', 'display: none')
    }

    function startNest() {
        // Once started, don't allow this anymore
        document.removeEventListener('dragover', FileDragHover, false)
        document.removeEventListener('dragleave', FileDragHover, false)
        document.removeEventListener('drop', FileDrop, false)

        svgNest.start(progress, renderSvg)
        startLabel.innerHTML = 'Stop Nest'
        start.className = 'button spinner'
        configButton.className = 'button config disabled'
        config.className = ''
        zoomIn.className = 'button zoom in disabled'
        zoomOut.className = 'button zoom out disabled'

        const svg = document.querySelector('#select svg')
        if (svg) {
            svg.removeAttribute('style')
        }

        isWorking = true
    }

    function stopNest() {
        svgNest.stop()
        startLabel.innerHTML = 'Start Nest'
        start.className = 'button start'
        configButton.className = 'button config'

        isWorking = false
    }

    let prevPercent = 0
    let startTime = null

    function progress(percent) {
        prevPercent = percent

        const now = new Date().getTime()
        if (startTime && now) {
            const diff = now - startTime
            // show a time estimate for long-running placements
            const estimate = (diff / percent) * (1 - percent)
            document.getElementById('info_time').innerHTML = `${millisecondsToStr(estimate)} remaining`

            if (diff > 5000 && percent < 0.3 && percent > 0.02 && estimate > 10000) {
                document.getElementById('info_time').setAttribute('style', 'display: block')
            }
        }

        if (percent > 0.95 || percent < 0.02) {
            document.getElementById('info_time').setAttribute('style', 'display: none')
        }
        if (percent < 0.02) {
            startTime = new Date().getTime()
        }
    }

    var iterations = 0

    function renderSvg(svgList, efficiency, placed, total) {
        iterations++
        document.getElementById('info_iterations').innerHTML = iterations

        if (!svgList || svgList.length === 0) {
            return
        }
        const bins = document.getElementById('bins')
        bins.innerHTML = ''

        for (let i = 0; i < svgList.length; i++) {
            if (svgList.length > 2) {
                svgList[i].setAttribute('class', 'grid')
            }
            bins.appendChild(svgList[i])
        }

        if (efficiency || efficiency === 0) {
            document.getElementById('info_efficiency').innerHTML = Math.round(efficiency * 100)
        }

        document.getElementById('info_placed').innerHTML = `${placed}/${total}`

        document.getElementById('info_placement').setAttribute('style', 'display: block')
        display.setAttribute('style', 'display: none')
        download.className = 'button download animated bounce'
    }
}
