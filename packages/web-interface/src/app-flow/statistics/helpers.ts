function numberEnding(number: number): string {
    return number > 1 ? 's' : ''
}

export function millisecondsToStr(milliseconds: number): string {
    let temp = Math.floor(milliseconds / 1000)
    const years = Math.floor(temp / 31536000)
    if (years) {
        return `${years} year${numberEnding(years)}`
    }
    const days = Math.floor((temp = temp % 31536000) / 86400)
    if (days) {
        return `${days} day${numberEnding(days)}`
    }
    const hours = Math.floor((temp = temp % 86400) / 3600)
    if (hours) {
        return `${hours} hour${numberEnding(hours)}`
    }
    const minutes = Math.floor((temp = temp % 3600) / 60)
    if (minutes) {
        return `${minutes} minute${numberEnding(minutes)}`
    }
    const seconds = temp % 60
    if (seconds) {
        return `${seconds} second${numberEnding(seconds)}`
    }

    return 'less than a second'
}
