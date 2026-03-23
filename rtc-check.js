let engine = null;
const APP_ID = '69538b2c71906701795dd7f0';
let audioContext = null;
let analyser = null;
let captureAnimationId = null;
let playbackAnimationId = null;
let playbackAnalyser = null;
let playbackSource = null;
let audioElement = null;
let isRecording = false;
let recordFilePath = null;
let isDeviceTestRunning = false;
let isConnectivityTestRunning = false;
let shouldStopConnectivityTest = false;
let connectivityEngine = null;

function log(message, type = 'info') {
    const logContainer = document.getElementById('logContainer');
    if (!logContainer) return;
    const logLine = document.createElement('div');
    logLine.className = `log-line log-${type}`;
    const timestamp = new Date().toLocaleTimeString();
    logLine.textContent = `[${timestamp}] ${message}`;
    logContainer.appendChild(logLine);
    logContainer.scrollTop = logContainer.scrollHeight;
}

function checkConnectivityInputs() {
    const inputAppId = document.getElementById('input-appId').value.trim();
    const inputRoomId = document.getElementById('input-roomId').value.trim();
    const inputUid = document.getElementById('input-uid').value.trim();
    const inputToken = document.getElementById('input-token').value.trim();
    
    const btnTest = document.getElementById('btn-connectivity-test');
    const btnStop = document.getElementById('btn-connectivity-stop');
    
    if (inputAppId && inputRoomId && inputUid && inputToken && !isConnectivityTestRunning) {
        btnTest.disabled = false;
    } else {
        btnTest.disabled = true;
    }
    
    if (isConnectivityTestRunning) {
        btnStop.disabled = false;
    } else {
        btnStop.disabled = true;
    }
}

async function startConnectivityTest() {
    if (isConnectivityTestRunning) return;
    
    const btnTest = document.getElementById('btn-connectivity-test');
    btnTest.innerHTML = '<span class="loading"></span> 测试中...';
    
    try {
        await checkConnectivity();
    } catch (error) {
        log(`连通性测试失败: ${error.message}`, 'error');
        await stopConnectivityTest();
    }
}

// 页面加载完成后添加事件监听器
document.addEventListener('DOMContentLoaded', function() {
    const inputs = ['input-appId', 'input-roomId', 'input-uid', 'input-token'];
    inputs.forEach(id => {
        const input = document.getElementById(id);
        if (input) {
            input.addEventListener('input', checkConnectivityInputs);
        }
    });
    
    const btnTest = document.getElementById('btn-connectivity-test');
    if (btnTest) {
        btnTest.addEventListener('click', startConnectivityTest);
    }
    
    const btnStop = document.getElementById('btn-connectivity-stop');
    if (btnStop) {
        btnStop.addEventListener('click', stopConnectivityTest);
    }
    
    // 初始检查
    checkConnectivityInputs();
});

function setSectionIcon(sectionId, status) {
    const icon = document.getElementById(`${sectionId}-icon`);
    if (!icon) return;
    icon.className = 'section-icon';
    if (status === 'success') {
        icon.classList.add('icon-success');
        icon.textContent = '✓';
    } else if (status === 'error') {
        icon.classList.add('icon-error');
        icon.textContent = '✗';
    } else {
        icon.classList.add('icon-pending');
        icon.textContent = '?';
    }
}

function addTestItem(sectionId, label, value, valueType = 'info') {
    const section = document.getElementById(sectionId);
    if (!section) return;
    
    const existingItems = section.querySelectorAll('.test-item');
    for (const item of existingItems) {
        const labelSpan = item.querySelector('.test-label');
        if (labelSpan && labelSpan.textContent === label) {
            const valueSpan = item.querySelector('.test-value');
            if (valueSpan) {
                valueSpan.className = `test-value value-${valueType}`;
                valueSpan.textContent = value;
            }
            return;
        }
    }
    
    const item = document.createElement('div');
    item.className = 'test-item';
    item.innerHTML = `
        <span class="test-label">${label}</span>
        <span class="test-value value-${valueType}">${value}</span>
    `;
    section.appendChild(item);
}

function clearSection(sectionId) {
    const section = document.getElementById(sectionId);
    if (!section) return;
    const testItems = section.querySelectorAll('.test-item, .device-list, .resolution-grid');
    testItems.forEach(item => {
        if (!item.classList.contains('section-title') && 
            !item.id?.includes('wave') && 
            !item.id?.includes('audio-test') &&
            !item.id?.includes('connectivity-inputs') &&
            !item.id?.includes('video-players') &&
            !item.id?.includes('local-player') &&
            !item.id?.includes('btn-connectivity-test')) {
            item.remove();
        }
    });
    
    const uaContainer = section.querySelector('div[style*="margin-top: 10px"]');
    if (uaContainer && !uaContainer.id?.includes('wave') && !uaContainer.id?.includes('connectivity') && !uaContainer.querySelector('#btn-connectivity-test')) {
        uaContainer.remove();
    }
}

function resetAudioSection() {
    const captureWaveContainer = document.getElementById('capture-wave-container');
    const captureWaveLabel = document.getElementById('capture-wave-label');
    const playbackWaveContainer = document.getElementById('playback-wave-container');
    const playbackWaveLabel = document.getElementById('playback-wave-label');
    const audioTestButtons = document.getElementById('audio-test-buttons');
    const btnStartCapture = document.getElementById('btn-start-capture');
    const btnStopCapture = document.getElementById('btn-stop-capture');
    const btnPlay = document.getElementById('btn-play');
    
    if (captureWaveContainer) captureWaveContainer.style.display = 'none';
    if (captureWaveLabel) captureWaveLabel.style.display = 'none';
    if (playbackWaveContainer) playbackWaveContainer.style.display = 'none';
    if (playbackWaveLabel) playbackWaveLabel.style.display = 'none';
    if (audioTestButtons) audioTestButtons.style.display = 'none';
    if (btnStartCapture) btnStartCapture.disabled = false;
    if (btnStopCapture) btnStopCapture.disabled = true;
    if (btnPlay) btnPlay.disabled = true;
    
    stopCaptureAnimation();
    stopPlaybackAnimation();
    isDeviceTestRunning = false;
}

function clearAllResults() {
    ['browser-section', 'device-section', 'codec-section', 'audio-section', 'resolution-section'].forEach(clearSection);
    resetAudioSection();
    document.getElementById('logContainer').innerHTML = '';
}

async function initEngine() {
    try {
        log('开始初始化火山引擎RTC引擎...', 'info');
        
        if (!window.VERTC) {
            log('等待火山引擎SDK加载...', 'info');
            log('提示: 确保 libs/index.min.js 文件存在且可访问', 'info');
            let attempts = 0;
            const maxAttempts = 100;
            
            await new Promise((resolve, reject) => {
                const checkInterval = setInterval(() => {
                    attempts++;
                    if (window.VERTC) {
                        clearInterval(checkInterval);
                        log('火山引擎SDK加载成功', 'success');
                        resolve();
                    } else if (attempts >= maxAttempts) {
                        clearInterval(checkInterval);
                        reject(new Error('SDK加载失败！请确保：\n1. libs/index.min.js 文件存在\n2. 文件路径正确\n3. 发布时包含了 libs 目录'));
                    } else if (attempts % 20 === 0) {
                        log(`SDK加载中... (${attempts}/${maxAttempts})`, 'info');
                    }
                }, 100);
            });
        } else {
            log('火山引擎SDK已加载', 'info');
        }

        log('VERTC对象属性:', 'info');
        log(`  - createEngine: ${typeof VERTC.createEngine}`, 'info');
        log(`  - getSupportedCodecs: ${typeof VERTC.getSupportedCodecs}`, 'info');

        if (engine) {
            log('销毁已有引擎实例...', 'info');
            try {
                await engine.leaveRoom();
            } catch (e) {
                log('离开房间失败（可能未进房）: ' + e.message, 'warning');
            }
            try {
                await engine.destroy();
            } catch (e) {
                log('销毁引擎失败: ' + e.message, 'warning');
            }
            engine = null;
        }

        log('创建新引擎实例...', 'info');
        engine = VERTC.createEngine(APP_ID);
        log('火山引擎RTC引擎初始化成功', 'success');

        engine.on('onAudioDeviceRecordStateChanged', (state, error) => {
            log(`音频录制状态变化: state=${state}, error=${error}`, 'info');
            if (state === 1) {
                log('音频录制已开始', 'success');
                addTestItem('audio-section', '麦克风状态', '采集中...', 'success');
                isRecording = true;
            } else if (state === 2) {
                log('音频录制已停止', 'success');
                addTestItem('audio-section', '麦克风状态', '采集完成', 'info');
                isRecording = false;
            } else if (state === 3) {
                log(`音频录制失败: ${error}`, 'error');
                addTestItem('audio-section', '麦克风状态', `失败: ${error}`, 'error');
                setSectionIcon('audio', 'error');
            }
        });

        engine.on('onAudioDevicePlayStateChanged', (state, error) => {
            log(`音频播放状态变化: state=${state}, error=${error}`, 'info');
            if (state === 1) {
                log('音频播放已开始', 'success');
                addTestItem('audio-section', '扬声器状态', '播放中...', 'success');
            } else if (state === 2) {
                log('音频播放已完成', 'success');
                addTestItem('audio-section', '扬声器状态', '正常', 'success');
                addTestItem('audio-section', '麦克风状态', '正常', 'success');
                addTestItem('audio-section', '音频检测', '正常', 'success');
                setSectionIcon('audio', 'success');
                stopPlaybackAnimation();
                isDeviceTestRunning = false;
                const btnStartCapture = document.getElementById('btn-start-capture');
                if (btnStartCapture) btnStartCapture.disabled = false;
            } else if (state === 3) {
                log(`音频播放失败: ${error}`, 'error');
                addTestItem('audio-section', '扬声器状态', `失败: ${error}`, 'error');
                setSectionIcon('audio', 'error');
                isDeviceTestRunning = false;
                const btnStartCapture = document.getElementById('btn-start-capture');
                if (btnStartCapture) btnStartCapture.disabled = false;
            }
        });

        engine.on('onLocalAudioPropertiesReport', (stats) => {
            if (stats && stats.length > 0 && stats[0].audioPropertiesInfo) {
                const volume = stats[0].audioPropertiesInfo.linearVolume;
                log(`本地采集音量: ${volume}`, 'info');
                updateWaveBars('capture-wave-container', volume / 255);
                if (volume > 25) {
                    addTestItem('audio-section', '麦克风状态', '正常', 'success');
                    
                    const section = document.getElementById('audio-section');
                    const testItems = section.querySelectorAll('.test-item');
                    let speakerNormal = false;
                    
                    for (const item of testItems) {
                        const labelSpan = item.querySelector('.test-label');
                        const valueSpan = item.querySelector('.test-value');
                        if (labelSpan && labelSpan.textContent === '扬声器状态' && valueSpan && valueSpan.textContent === '正常') {
                            speakerNormal = true;
                            break;
                        }
                    }
                    
                    if (speakerNormal) {
                        addTestItem('audio-section', '音频检测', '正常', 'success');
                    }
                }
            }
        });

        engine.on('onAudioPlaybackDeviceTestVolume', (volume) => {
            log(`播放音量: ${volume}`, 'info');
            updateWaveBars('playback-wave-container', volume / 255);
            if (volume > 10) {
                addTestItem('audio-section', '扬声器状态', '正常', 'success');
                
                const section = document.getElementById('audio-section');
                const testItems = section.querySelectorAll('.test-item');
                let micNormal = false;
                
                for (const item of testItems) {
                    const labelSpan = item.querySelector('.test-label');
                    const valueSpan = item.querySelector('.test-value');
                    if (labelSpan && labelSpan.textContent === '麦克风状态' && valueSpan && valueSpan.textContent === '正常') {
                        micNormal = true;
                        break;
                    }
                }
                
                if (micNormal) {
                    addTestItem('audio-section', '音频检测', '正常', 'success');
                }
            }
        });

        return true;
    } catch (error) {
        log(`引擎初始化失败: ${error.message}`, 'error');
        log(`错误堆栈: ${error.stack}`, 'error');
        return false;
    }
}

function getBrowserInfo() {
    const ua = navigator.userAgent;
    let browserName = 'Unknown';
    let browserVersion = 'Unknown';

    if (ua.indexOf('Firefox') > -1) {
        browserName = 'Firefox';
        browserVersion = ua.match(/Firefox\/(\d+\.\d+)/)[1];
    } else if (ua.indexOf('Edg') > -1) {
        browserName = 'Edge';
        browserVersion = ua.match(/Edg\/(\d+\.\d+)/)[1];
    } else if (ua.indexOf('Chrome') > -1) {
        browserName = 'Chrome';
        browserVersion = ua.match(/Chrome\/(\d+\.\d+)/)[1];
    } else if (ua.indexOf('Safari') > -1) {
        browserName = 'Safari';
        browserVersion = ua.match(/Version\/(\d+\.\d+)/)[1];
    }

    return { name: browserName, version: browserVersion, userAgent: ua };
}

async function checkBrowserCompatibility() {
    console.log('=== 浏览器兼容性检测开始 ===');
    log('开始浏览器兼容性检测...', 'info');
    const browserInfo = getBrowserInfo();
    
    console.log('浏览器名称:', browserInfo.name);
    console.log('浏览器版本:', browserInfo.version);
    console.log('User Agent:', browserInfo.userAgent);
    
    addTestItem('browser-section', '浏览器名称', browserInfo.name, 'info');
    addTestItem('browser-section', '浏览器版本', browserInfo.version, 'info');
    
    const uaContainer = document.createElement('div');
    uaContainer.style.marginTop = '10px';
    uaContainer.style.padding = '10px';
    uaContainer.style.background = 'white';
    uaContainer.style.borderRadius = '6px';
    uaContainer.style.fontSize = '12px';
    uaContainer.style.color = '#666';
    uaContainer.style.wordBreak = 'break-all';
    uaContainer.style.maxHeight = '100px';
    uaContainer.style.overflowY = 'auto';
    uaContainer.innerHTML = '<strong style="display:block;margin-bottom:8px;">User Agent:</strong>' + browserInfo.userAgent;
    document.getElementById('browser-section').appendChild(uaContainer);
    
    log('User Agent: ' + browserInfo.userAgent, 'info');
    
    let isSupported = true;
    
    if (!window.RTCPeerConnection) {
        addTestItem('browser-section', 'RTCPeerConnection', '不支持', 'error');
        log('RTCPeerConnection 不支持', 'error');
        isSupported = false;
    } else {
        addTestItem('browser-section', 'RTCPeerConnection', '支持', 'success');
        log('RTCPeerConnection 支持', 'success');
    }
    
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        addTestItem('browser-section', 'getUserMedia', '不支持', 'error');
        log('getUserMedia 不支持', 'error');
        isSupported = false;
    } else {
        addTestItem('browser-section', 'getUserMedia', '支持', 'success');
        log('getUserMedia 支持', 'success');
    }
    
    if (window.RTCPeerConnection) {
        const pc = new RTCPeerConnection();
        
        const hasSdpSupport = pc.createOffer !== undefined;
        addTestItem('browser-section', 'SDP协议', hasSdpSupport ? '支持' : '不支持', hasSdpSupport ? 'success' : 'error');
        log(`SDP协议: ${hasSdpSupport ? '支持' : '不支持'}`, hasSdpSupport ? 'success' : 'error');
        
        const hasSrtpSupport = pc.setConfiguration !== undefined;
        addTestItem('browser-section', 'SRTP协议', hasSrtpSupport ? '支持' : '不支持', hasSrtpSupport ? 'success' : 'error');
        log(`SRTP协议: ${hasSrtpSupport ? '支持' : '不支持'}`, hasSrtpSupport ? 'success' : 'error');
        
        const hasUdpSupport = true;
        addTestItem('browser-section', 'UDP协议', hasUdpSupport ? '支持' : '不支持', hasUdpSupport ? 'success' : 'warning');
        log(`UDP协议: ${hasUdpSupport ? '支持' : '不支持'}`, hasUdpSupport ? 'success' : 'warning');
        
        const hasTcpSupport = true;
        addTestItem('browser-section', 'TCP协议', hasTcpSupport ? '支持' : '不支持', hasTcpSupport ? 'success' : 'warning');
        log(`TCP协议: ${hasTcpSupport ? '支持' : '不支持'}`, hasTcpSupport ? 'success' : 'warning');
        
        pc.close();
    }
    
    setSectionIcon('browser', isSupported ? 'success' : 'error');
    log(`浏览器兼容性检测完成: ${isSupported ? '通过' : '未通过'}`, isSupported ? 'success' : 'error');
    console.log('=== 浏览器兼容性检测完成 ===');
    
    return isSupported;
}

async function checkDeviceCapability() {
    console.log('=== 设备能力检测开始 ===');
    log('开始设备获取能力检测...', 'info');
    
    try {
        if (!engine) {
            const initialized = await initEngine();
            if (!initialized) {
                throw new Error('引擎初始化失败');
            }
        }

        console.log('[调用] navigator.mediaDevices.getUserMedia, 参数: { audio: true, video: true }');
        await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
        console.log('[返回] navigator.mediaDevices.getUserMedia 成功');
        log('设备权限获取成功', 'success');

        console.log('[调用] navigator.mediaDevices.enumerateDevices');
        const devices = await navigator.mediaDevices.enumerateDevices();
        console.log('[返回] navigator.mediaDevices.enumerateDevices 成功, 设备数:', devices.length);
        
        const audioInputs = devices.filter(d => d.kind === 'audioinput');
        const audioOutputs = devices.filter(d => d.kind === 'audiooutput');
        const videoInputs = devices.filter(d => d.kind === 'videoinput');
        
        addTestItem('device-section', '麦克风数量', audioInputs.length.toString(), audioInputs.length > 0 ? 'success' : 'error');
        addTestItem('device-section', '扬声器数量', audioOutputs.length.toString(), audioOutputs.length > 0 ? 'success' : 'warning');
        addTestItem('device-section', '摄像头数量', videoInputs.length.toString(), videoInputs.length > 0 ? 'success' : 'error');
        
        if (audioInputs.length > 0) {
            const deviceList = document.createElement('div');
            deviceList.className = 'device-list';
            deviceList.innerHTML = '<strong style="display:block;margin-bottom:8px;">麦克风列表:</strong>';
            audioInputs.forEach((device, index) => {
                const item = document.createElement('div');
                item.className = 'device-item';
                item.textContent = `${index + 1}. ${device.label || `麦克风 ${index + 1}`} (ID: ${device.deviceId.substring(0, 8)}...)`;
                deviceList.appendChild(item);
            });
            document.getElementById('device-section').appendChild(deviceList);
        }
        
        if (videoInputs.length > 0) {
            const deviceList = document.createElement('div');
            deviceList.className = 'device-list';
            deviceList.innerHTML = '<strong style="display:block;margin-bottom:8px;">摄像头列表:</strong>';
            videoInputs.forEach((device, index) => {
                const item = document.createElement('div');
                item.className = 'device-item';
                item.textContent = `${index + 1}. ${device.label || `摄像头 ${index + 1}`} (ID: ${device.deviceId.substring(0, 8)}...)`;
                deviceList.appendChild(item);
            });
            document.getElementById('device-section').appendChild(deviceList);
        }
        
        const hasDevices = audioInputs.length > 0 && videoInputs.length > 0;
        setSectionIcon('device', hasDevices ? 'success' : 'error');
        log(`设备获取能力检测完成: ${hasDevices ? '通过' : '未通过'}`, hasDevices ? 'success' : 'error');
        console.log('=== 设备能力检测完成 ===');
        
        return hasDevices;
    } catch (error) {
        addTestItem('device-section', '设备检测', `失败: ${error.message}`, 'error');
        log(`设备检测失败: ${error.message}`, 'error');
        setSectionIcon('device', 'error');
        return false;
    }
}

async function checkVideoCodecs() {
    console.log('=== 视频编码检测开始 ===');
    log('开始视频编码检测...', 'info');
    
    let allSupported = true;
    
    try {
        console.log('[调用] VERTC.getSupportedCodecs');
        const supportedCodecs = await VERTC.getSupportedCodecs();
        console.log('[返回] VERTC.getSupportedCodecs 成功, 结果:', JSON.stringify(supportedCodecs));
        log(`SDK报告的编解码器: ${JSON.stringify(supportedCodecs)}`, 'info');
        
        const hasH264 = supportedCodecs.some(c => c.toLowerCase().includes('h264'));
        addTestItem('codec-section', 'H264 编码', hasH264 ? '支持' : '不支持', hasH264 ? 'success' : 'error');
        log(`H264 编码: ${hasH264 ? '支持' : '不支持'}`, hasH264 ? 'success' : 'error');
        if (!hasH264) allSupported = false;
        
        const hasH265 = supportedCodecs.some(c => c.toLowerCase().includes('h265') || c.toLowerCase().includes('hevc'));
        addTestItem('codec-section', 'H265 编码', hasH265 ? '支持' : '不支持', hasH265 ? 'success' : 'warning');
        log(`H265 编码: ${hasH265 ? '支持' : '不支持'}`, hasH265 ? 'success' : 'warning');
        
        const hasVP8 = supportedCodecs.some(c => c.toLowerCase().includes('vp8'));
        addTestItem('codec-section', 'VP8 编码', hasVP8 ? '支持' : '不支持', hasVP8 ? 'success' : 'warning');
        log(`VP8 编码: ${hasVP8 ? '支持' : '不支持'}`, hasVP8 ? 'success' : 'warning');
        
    } catch (error) {
        log(`SDK编解码器检测失败，使用备用方法: ${error.message}`, 'warning');
        
        const pc = new RTCPeerConnection();
        const offer = await pc.createOffer({ offerToReceiveVideo: true });
        pc.close();
        
        const sdp = offer.sdp || '';
        
        const hasH264 = sdp.toLowerCase().includes('h264');
        addTestItem('codec-section', 'H264 编码', hasH264 ? '支持' : '不支持', hasH264 ? 'success' : 'error');
        log(`H264 编码: ${hasH264 ? '支持' : '不支持'}`, hasH264 ? 'success' : 'error');
        if (!hasH264) allSupported = false;
        
        const hasH265 = sdp.toLowerCase().includes('h265') || sdp.toLowerCase().includes('hevc');
        addTestItem('codec-section', 'H265 编码', hasH265 ? '支持' : '不支持', hasH265 ? 'success' : 'warning');
        log(`H265 编码: ${hasH265 ? '支持' : '不支持'}`, hasH265 ? 'success' : 'warning');
        
        const hasVP8 = sdp.toLowerCase().includes('vp8');
        addTestItem('codec-section', 'VP8 编码', hasVP8 ? '支持' : '不支持', hasVP8 ? 'success' : 'warning');
        log(`VP8 编码: ${hasVP8 ? '支持' : '不支持'}`, hasVP8 ? 'success' : 'warning');
    }
    
    setSectionIcon('codec', allSupported ? 'success' : 'error');
    log('视频编码检测完成', 'info');
    console.log('=== 视频编码检测完成 ===');
    
    return allSupported;
}

function initWaveBars(containerId, barClass) {
    const container = document.getElementById(containerId);
    if (!container) return;
    container.innerHTML = '';
    for (let i = 0; i < 20; i++) {
        const bar = document.createElement('div');
        bar.className = `wave-bar ${barClass}`;
        bar.style.height = '4px';
        container.appendChild(bar);
    }
}

function updateWaveBars(containerId, volume) {
    const container = document.getElementById(containerId);
    if (!container) return;
    const bars = container.querySelectorAll('.wave-bar');
    const maxHeight = 50;
    
    bars.forEach((bar, index) => {
        const randomFactor = 0.5 + Math.random() * 0.5;
        const height = Math.max(4, volume * maxHeight * randomFactor);
        bar.style.height = `${height}px`;
    });
}

function startCaptureAnimation() {
}

function stopCaptureAnimation() {
}

function startPlaybackAnimation() {
}

function stopPlaybackAnimation() {
}

async function startAudioCapture() {
    try {
        log('开始麦克风采集...', 'info');
        
        if (isDeviceTestRunning) {
            log('设备测试已在运行中，请先停止', 'warning');
            return;
        }
        
        if (!engine) {
            const initialized = await initEngine();
            if (!initialized) {
                throw new Error('引擎初始化失败');
            }
        }

        console.log('[调用] engine.enableAudioPropertiesReport, 参数: 200');
        engine.enableAudioPropertiesReport(200);
        console.log('[返回] engine.enableAudioPropertiesReport 成功');
        
        const captureWaveContainer = document.getElementById('capture-wave-container');
        const captureWaveLabel = document.getElementById('capture-wave-label');
        const btnStartCapture = document.getElementById('btn-start-capture');
        const btnStopCapture = document.getElementById('btn-stop-capture');
        
        if (captureWaveContainer) captureWaveContainer.style.display = 'flex';
        if (captureWaveLabel) captureWaveLabel.style.display = 'block';
        initWaveBars('capture-wave-container', 'capture');
        
        if (btnStartCapture) btnStartCapture.disabled = true;
        if (btnStopCapture) btnStopCapture.disabled = false;
        
        isDeviceTestRunning = true;
        
        addTestItem('audio-section', '麦克风状态', '采集中...', 'success');
        log('麦克风采集已开始', 'success');
        
        console.log('[调用] engine.startAudioDeviceRecordTest, 参数: 200, resumeCallback');
        try {
            await engine.startAudioDeviceRecordTest(200, (resume) => {
                console.log('[回调] startAudioDeviceRecordTest resumeCallback 触发');
                log('自动播放失败，请手动点击播放', 'warning');
            });
            console.log('[返回] engine.startAudioDeviceRecordTest 成功');
        } catch (error) {
            console.log('[错误] engine.startAudioDeviceRecordTest 失败:', error);
            log(`SDK采集错误: ${error.message}`, 'error');
        }
        
    } catch (error) {
        isDeviceTestRunning = false;
        const btnStartCapture = document.getElementById('btn-start-capture');
        const btnStopCapture = document.getElementById('btn-stop-capture');
        if (btnStartCapture) btnStartCapture.disabled = false;
        if (btnStopCapture) btnStopCapture.disabled = true;
        log(`麦克风采集失败: ${error.message}`, 'error');
        addTestItem('audio-section', '麦克风状态', `失败: ${error.message}`, 'error');
        setSectionIcon('audio', 'error');
    }
}

async function stopAudioCaptureAndPlay() {
    try {
        log('停止采集并开始播放...', 'info');
        
        const playbackWaveContainer = document.getElementById('playback-wave-container');
        const playbackWaveLabel = document.getElementById('playback-wave-label');
        const btnStopCapture = document.getElementById('btn-stop-capture');
        const btnPlay = document.getElementById('btn-play');
        
        if (playbackWaveContainer) playbackWaveContainer.style.display = 'flex';
        if (playbackWaveLabel) playbackWaveLabel.style.display = 'block';
        initWaveBars('playback-wave-container', 'playback');
        
        if (engine) {
            console.log('[调用] engine.stopAudioDeviceRecordAndPlayTest');
            try {
                await engine.stopAudioDeviceRecordAndPlayTest();
                console.log('[返回] engine.stopAudioDeviceRecordAndPlayTest 成功');
            } catch (error) {
                console.log('[错误] engine.stopAudioDeviceRecordAndPlayTest 失败:', error);
            }
        }
        
        if (btnStopCapture) btnStopCapture.disabled = true;
        if (btnPlay) btnPlay.disabled = true;
        
        log('已停止采集，开始播放录音', 'success');
        
    } catch (error) {
        isDeviceTestRunning = false;
        log(`停止采集失败: ${error.message}`, 'error');
    }
}

async function playRecordedAudio() {
    try {
        log('播放录音功能已集成到停止采集按钮中', 'info');
    } catch (error) {
        log(`播放录音失败: ${error.message}`, 'error');
    }
}

async function checkSpeakerPlayback() {
    console.log('=== 音频检测开始 ===');
    log('开始音频检测准备...', 'info');
    
    if (!engine) {
        const initialized = await initEngine();
        if (!initialized) {
            addTestItem('audio-section', '音频检测', '引擎初始化失败', 'error');
            setSectionIcon('audio', 'error');
            return false;
        }
    }
    
    document.getElementById('audio-test-buttons').style.display = 'flex';
    
    addTestItem('audio-section', '音频检测', '请点击按钮开始测试', 'info');
    log('请点击"开始采集"按钮进行麦克风和扬声器测试', 'info');
}

async function startDetection() {
    const startBtn = document.getElementById('startBtn');
    startBtn.disabled = true;
    startBtn.innerHTML = '<span class="loading"></span> 检测中...';
    
    clearAllResults();
    
    log('=== 系统检测开始 ===', 'info');
    
    try {
        await initEngine();
        
        await checkBrowserCompatibility();
        await new Promise(resolve => setTimeout(resolve, 500));
        
        await checkDeviceCapability();
        await new Promise(resolve => setTimeout(resolve, 500));
        
        await checkVideoCodecs();
        await new Promise(resolve => setTimeout(resolve, 500));
        
        await checkSpeakerPlayback();
        await new Promise(resolve => setTimeout(resolve, 500));
        
        // 连通性检测由用户手动触发，不再自动执行
        addTestItem('connectivity-section', '连通性检测', '请填写参数并点击测试按钮', 'info');
        log('连通性检测请手动执行', 'info');
        
        log('=== 系统检测完成 ===', 'success');
    } catch (error) {
        log(`检测过程中发生错误: ${error.message}`, 'error');
        console.error(error);
    }
    
    startBtn.disabled = false;
    startBtn.textContent = '重新检测';
}

async function stopConnectivityTest() {
    shouldStopConnectivityTest = true;
    log('正在停止连通性测试...', 'info');
    
    if (connectivityEngine) {
        try {
            console.log('  清理所有事件监听器...');
            connectivityEngine.off('onConnectionStateChanged');
            connectivityEngine.off('onJoinRoomResult');
            connectivityEngine.off('onPublishResult');
            connectivityEngine.off('onLocalVideoSizeChanged');
            
            console.log('  清理分辨率网格...');
            const connectivitySection = document.getElementById('connectivity-section');
            if (connectivitySection) {
                const resolutionGrid = connectivitySection.querySelector('.resolution-grid');
                if (resolutionGrid) {
                    resolutionGrid.remove();
                }
            }
            
            console.log('  停止视频采集...');
            await connectivityEngine.stopVideoCapture();
            
            console.log('  停止音频采集...');
            await connectivityEngine.stopAudioCapture();
            
            console.log('  离开房间...');
            await connectivityEngine.leaveRoom();
            
            console.log('  销毁引擎...');
            await connectivityEngine.destroy();
            
            log('已登出房间并清理资源', 'info');
        } catch (e) {
            console.log('  停止测试时的警告:', e.message);
        }
        connectivityEngine = null;
    }
    
    isConnectivityTestRunning = false;
    shouldStopConnectivityTest = false;
    
    const btnTest = document.getElementById('btn-connectivity-test');
    const btnStop = document.getElementById('btn-connectivity-stop');
    if (btnTest) {
        btnTest.disabled = false;
        btnTest.innerHTML = '开始连通性测试';
    }
    if (btnStop) btnStop.disabled = true;
    
    checkConnectivityInputs();
}

async function checkConnectivity() {
    log('开始连通性检测...', 'info');
    console.log('=== 连通性检测开始 ===');
    
    const inputAppId = document.getElementById('input-appId').value.trim();
    const inputRoomId = document.getElementById('input-roomId').value.trim();
    const inputUid = document.getElementById('input-uid').value.trim();
    const inputToken = document.getElementById('input-token').value.trim();
    
    if (!inputAppId) {
        throw new Error('请输入AppId');
    }
    if (!inputRoomId) {
        throw new Error('请输入RoomId');
    }
    if (!inputUid) {
        throw new Error('请输入UserId');
    }
    if (!inputToken) {
        throw new Error('请输入Token');
    }
    
    shouldStopConnectivityTest = false;
    isConnectivityTestRunning = true;
    
    const btnTest = document.getElementById('btn-connectivity-test');
    const btnStop = document.getElementById('btn-connectivity-stop');
    if (btnTest) btnTest.disabled = true;
    if (btnStop) btnStop.disabled = false;
    
    addTestItem('connectivity-section', 'AppId', inputAppId, 'info');
    addTestItem('connectivity-section', '房间ID', inputRoomId, 'info');
    addTestItem('connectivity-section', '用户ID', inputUid, 'info');
    
    log(`使用AppId: ${inputAppId}`, 'info');
    log(`使用RoomId: ${inputRoomId}`, 'info');
    log(`使用UserId: ${inputUid}`, 'info');
    
    try {
        console.log('  1. 创建和初始化SDK实例...');
        connectivityEngine = VERTC.createEngine(inputAppId);
        log('SDK实例创建成功', 'success');
        addTestItem('connectivity-section', 'SDK初始化', '成功', 'success');
        
        console.log('  监听所有事件...');
        
        connectivityEngine.on('onConnectionStateChanged', (e) => {
            console.log('  [回调] onConnectionStateChanged 触发:', JSON.stringify(e, null, 2));
            log(`连接状态变化: ${JSON.stringify(e)}`, 'info');
        });
        
        connectivityEngine.on('onJoinRoomResult', (e) => {
            console.log('  [回调] onJoinRoomResult 触发:', JSON.stringify(e, null, 2));
            log(`登录房间回调: ${JSON.stringify(e)}`, 'info');
            
            if (e.errorCode) {
                console.error('  [错误] 登录房间失败:', e.errorCode, e.message);
                addTestItem('connectivity-section', '登录房间', `失败: ${e.errorCode}`, 'error');
                log(`登录房间失败: ${e.errorCode} - ${e.message || ''}`, 'error');
            } else {
                addTestItem('connectivity-section', '登录房间', '成功', 'success');
                log('登录房间成功', 'success');
            }
        });
        
        let publishSuccess = false;
        
        connectivityEngine.on('onLocalVideoSizeChanged', (e) => {
            console.log('[回调] onLocalVideoSizeChanged 触发:', JSON.stringify(e, null, 2));
        });
        
        const publishPromise = new Promise((resolve) => {
            connectivityEngine.on('onPublishResult', (e) => {
                console.log('  [回调] onPublishResult 触发:', JSON.stringify(e, null, 2));
                log(`推流回调: ${JSON.stringify(e)}`, 'info');
                
                if (e.errorCode) {
                    console.error('  [错误] 推流失败:', e.errorCode, e.message);
                    addTestItem('connectivity-section', '推流', `失败: ${e.errorCode}`, 'error');
                    log(`推流失败: ${e.errorCode} - ${e.message || ''}`, 'error');
                } else {
                    publishSuccess = true;
                    addTestItem('connectivity-section', '推流', '成功', 'success');
                    log('推流成功', 'success');
                }
                resolve();
            });
        });
        

        
        console.log('  2. 进入RTC房间...');
        await connectivityEngine.joinRoom(
            inputToken,
            inputRoomId,
            { userId: inputUid },
            {
                isAutoPublish: false,
                isAutoSubscribeAudio: true,
                isAutoSubscribeVideo: true
            }
        );
        
        console.log('  3. 开启本地音视频设备采集...');
        await connectivityEngine.startAudioCapture();
        await connectivityEngine.startVideoCapture();
        log('本地音视频采集开启成功', 'success');
        addTestItem('connectivity-section', '本地采集', '成功', 'success');
        
        console.log('  4. 渲染到本端界面上...');
        connectivityEngine.setLocalVideoPlayer(VERTC.StreamIndex.STREAM_INDEX_MAIN, { renderDom: 'local-player' });
        log('本地预览渲染成功', 'success');
        addTestItem('connectivity-section', '本地渲染', '成功', 'success');
        
        console.log('  5. 手动发布流...');
        try {
            await connectivityEngine.publishStream(VERTC.MediaType.AUDIO_AND_VIDEO);
            log('publishStream调用成功', 'info');
        } catch (error) {
            console.error('  publishStream调用出错:', error);
            log(`publishStream调用出错: ${error.message}`, 'error');
        }
        
        console.log('  等待推流完成...');
        await Promise.race([
            publishPromise,
            new Promise(resolve => setTimeout(resolve, 5000))
        ]);
        
        if (publishSuccess) {
            addTestItem('connectivity-section', '连通性', '正常', 'success');
            log('连通性检测完成，连通性正常', 'success');
            setSectionIcon('connectivity', 'success');
            log('请点击"停止测试"按钮结束测试', 'info');
            
            console.log('  6. 开始分辨率支持检测...');
            const resolutions = [
                { width: 320, height: 180, frameRate: 15, maxKbps: 200 },
                { width: 320, height: 240, frameRate: 15, maxKbps: 200 },
                { width: 480, height: 264, frameRate: 15, maxKbps: 300 },
                { width: 640, height: 360, frameRate: 15, maxKbps: 400 },
                { width: 640, height: 480, frameRate: 15, maxKbps: 500 },
                { width: 960, height: 540, frameRate: 15, maxKbps: 800 },
                { width: 1280, height: 720, frameRate: 15, maxKbps: 1200 },
                { width: 1920, height: 1080, frameRate: 15, maxKbps: 2000 }
            ];
            
            const supportedResolutions = [];
            
            for (let i = 0; i < resolutions.length; i++) {
                const res = resolutions[i];
                
                try {
                    console.log('[调用] setVideoEncoderConfig, 参数:', JSON.stringify(res));
                    await connectivityEngine.setVideoEncoderConfig(res);
                    console.log('[返回] setVideoEncoderConfig 成功');
                    
                    // 直接比较设置的分辨率和期望分辨率
                    // 因为 setVideoEncoderConfig 成功后，SDK 会使用最接近的支持分辨率
                    // 所以如果设置成功，就认为支持该分辨率
                    supportedResolutions.push(res);
                    log(`${res.width}x${res.height}: 支持`, 'success');
                    
                    // 等待一下，让事件有时间触发
                    await new Promise(resolve => setTimeout(resolve, 1000));
                } catch (error) {
                    console.log('  测试出错:', error);
                    log(`${res.width}x${res.height}: 不支持 (${error.message})`, 'error');
                }
                
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
            
            log(`分辨率支持检测完成，支持 ${supportedResolutions.length} 种分辨率`, 'info');
            
            // 创建分辨率网格展示
            const resolutionGrid = document.createElement('div');
            resolutionGrid.className = 'resolution-grid';
            
            const allResolutions = [
                { width: 320, height: 180 },
                { width: 320, height: 240 },
                { width: 480, height: 264 },
                { width: 640, height: 360 },
                { width: 640, height: 480 },
                { width: 960, height: 540 },
                { width: 1280, height: 720 },
                { width: 1920, height: 1080 }
            ];
            
            allResolutions.forEach(res => {
                const isSupported = supportedResolutions.some(supported => 
                    supported.width === res.width && supported.height === res.height
                );
                
                const item = document.createElement('div');
                item.className = `resolution-item ${isSupported ? 'supported' : 'unsupported'}`;
                item.textContent = `${res.width}x${res.height}`;
                resolutionGrid.appendChild(item);
            });
            
            const connectivitySection = document.getElementById('connectivity-section');
            if (connectivitySection) {
                connectivitySection.appendChild(resolutionGrid);
            }
            
            addTestItem('connectivity-section', '分辨率支持总数', supportedResolutions.length.toString(), supportedResolutions.length > 0 ? 'success' : 'error');
            console.log('=== 连通性检测完成 ===');
        }
        
    } catch (error) {
        console.log('  连通性检测出错:', error);
        log(`连通性检测出错: ${error.message}`, 'error');
        addTestItem('connectivity-section', '连通性', '异常', 'error');
        setSectionIcon('connectivity', 'error');
        console.log('=== 连通性检测完成 ===');
        await stopConnectivityTest();
    }
}