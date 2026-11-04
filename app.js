// app.js : 主程式與 3D 數位雙胞胎連動
import { initDigitalTwin } from './digital-twin.js';
import { DroneProtocolParser } from './drone-protocol.js';

// 初始化 3D 畫面
const twin = initDigitalTwin('canvas-container');

let port;
let reader;
let pollInterval;
const connectBtn = document.getElementById('connect-btn');
const statusText = document.getElementById('status-text');
const indicator = document.getElementById('connection-indicator');

const parser = new DroneProtocolParser((type, data) => {
    if (type === 'state') {
        document.getElementById('val-front-range').textContent = `電池: ${data.battery}%`;
    }
    else if (type === 'motion') {
        // 即時更新介面上的數值顯示
        document.getElementById('val-roll').textContent = data.roll.toFixed(1) + '°';
        document.getElementById('val-pitch').textContent = data.pitch.toFixed(1) + '°';
        document.getElementById('val-yaw').textContent = data.yaw.toFixed(1) + '°';
        
        // 驅動 3D 數位雙胞胎模型同步旋轉
        twin.updatePose(data.roll, data.pitch, data.yaw);
    }
});

connectBtn.addEventListener('click', async () => {
    try {
        port = await navigator.serial.requestPort({ filters: [{ usbVendorId: 0x0483 }] });
        await port.open({ baudRate: 57600 });

        statusText.textContent = "已連線 (57600)";
        statusText.className = "text-sm text-emerald-400 font-medium";
        indicator.className = "w-3 h-3 bg-emerald-500 rounded-full shadow-[0_0_10px_#10b981]";
        connectBtn.textContent = "已連線";
        connectBtn.disabled = true;
        connectBtn.className = "bg-slate-700 text-slate-400 px-5 py-2 rounded-lg font-medium cursor-not-allowed";

        readSerial();

        // 定期發送狀態與姿態請求，保持通訊與即時 3D 同步
        pollInterval = setInterval(async () => {
            if (port && port.writable) {
                const writer = port.writable.getWriter();
                await writer.write(DroneProtocolParser.createRequestStatePacket());
                await writer.write(DroneProtocolParser.createRequestAttitudePacket());
                writer.releaseLock();
            }
        }, 100);

    } catch (err) {
        console.error("序列埠連線失敗：", err);
        alert("無法開啟序列埠，請確認硬體連線。");
    }
});

async function readSerial() {
    try {
        while (port.readable) {
            reader = port.readable.getReader();
            try {
                while (true) {
                    const { value, done } = await reader.read();
                    if (done) break;
                    if (value && value.length > 0) {
                        parser.feedData(value);
                    }
                }
            } catch (error) {
                console.error("讀取中斷錯誤：", error);
            } finally {
                reader.releaseLock();
            }
        }
    } catch (err) {
        console.error("Serial 讀取迴圈異常：", err);
    }
}

async function sendCommandPacket(packetUint8) {
    if (!port || !port.writable) return;
    try {
        const writer = port.writable.getWriter();
        await writer.write(packetUint8);
        writer.releaseLock();
    } catch (err) {
        console.error("發送指令失敗:", err);
    }
}

document.getElementById('btn-takeoff').addEventListener('click', async () => {
    await sendCommandPacket(DroneProtocolParser.createTakeoffPacket());
});

document.getElementById('btn-land').addEventListener('click', async () => {
    await sendCommandPacket(DroneProtocolParser.createLandPacket());
});

document.getElementById('btn-stop').addEventListener('click', async () => {
    await sendCommandPacket(DroneProtocolParser.createStopPacket());
});
