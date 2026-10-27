export function readConfig(settings) {
    return {
        displayName: settings.get_string('display-name').trim() || 'Remote GPU',
        primaryHost: settings.get_string('primary-host').trim(),
        fallbackHost: settings.get_string('fallback-host').trim(),
        sshConfigPath: settings.get_string('ssh-config-path').trim(),
        sshExecutable: settings.get_string('ssh-executable').trim(),
        refreshInterval: settings.get_int('refresh-interval'),
        batteryInterval: settings.get_int('battery-interval'),
        powerAware: settings.get_boolean('power-aware'),
    };
}
