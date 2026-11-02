// app.js : 主程式與 UI 互動繫結
import { initDigitalTwin } from './digital-twin.js';
import { DroneProtocolParser } from './drone-protocol.js';

const twin = initDigitalTwin('canvas-container');

let port;
let reader;
const connectBtn = document.getElementById('connect-btn');
const statusText = document.getElementById('status-text');
const indicator = document.getElementById('connection-indicator');

const parser = new DroneProtocolParser((type, data) => {
    if (type === 'motion') {
        document.getElementById('val-roll').textContent = data.roll.toFixed(1) + '°';
        document.getElementById('val-pitch').textContent = data.pitch.toFixed(1) + '°';
        document.getElementById('val-yaw').textContent = data.yaw.toFixed(1) + '°';
        twin.updatePose(data.roll, data.pitch, data.yaw);
    } 
    else if (type === 'range') {
        document.getElementById('val-front-range').textContent = data.front + ' mm';
        const warning = document.getElementById('range-warning');
        warning.className = data.front < 300 ? "w-3 h-3 rounded-full bg-rose-500 animate-ping" : "w-3 h-3 rounded-full bg-emerald-500";
    }
});

connectBtn.addEventListener('click', async () => {
    try {
        port = await navigator.serial.requestPort();
        await port.open({ baudRate: 115200 });

        statusText.textContent = "已連線";
        statusText.className = "text-sm text-emerald-400 font-medium";
        indicator.className = "w-3 h-3 bg-emerald-500 rounded-full shadow-[0_0_10px_#10b981]";
        connectBtn.textContent = "已連線";
        connectBtn.disabled = true;
        connectBtn.className = "bg-slate-700 text-slate-400 px-5 py-2 rounded-lg font-medium cursor-not-allowed";

        readSerial();

        // 💡 連線成功後，自動發送一次官方對應的 pair 初始化握手封包
        setTimeout(async () => {
            if (port && port.writable) {
                const writer = port.writable.getWriter();
                await writer.write(DroneProtocolParser.createPairPacket());
                writer.releaseLock();
                console.log("已發送官方 Pair 初始化握手封包");
            }
        }, 500);

    } catch (err) {
        console.error("序列埠連線失敗：", err);
        alert("無法開啟序列埠，請確認瀏覽器支援與裝置連線狀態。");
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
    if (!port || !port.writable) {
        console.warn("序列埠尚未連線或無法寫入");
        return;
    }
    try {
        const writer = port.writable.getWriter();
        await writer.write(packetUint8);
        writer.releaseLock();
        console.log("已發送指令封包:", packetUint8);
    } catch (err) {
        console.error("發送指令失敗:", err);
    }
}

// 點擊起飛：先發送 Pair 確保就緒，再執行起飛，1秒後自動降落
document.getElementById('btn-takeoff').addEventListener('click', async () => {
    console.log("網頁觸發：初始化並起飛！");
    
    // 確保起飛前發送 pair 握手
    await sendCommandPacket(DroneProtocolParser.createPairPacket());
    
    // 稍微延遲 100ms 後發送起飛指令
    setTimeout(async () => {
        const takeoffPacket = DroneProtocolParser.createTakeoffPacket();
        await sendCommandPacket(takeoffPacket);
    }, 100);

    // 1秒後自動降落停止
    setTimeout(async () => {
        console.log("網頁觸發：1秒到，自動降落！");
        const landPacket = DroneProtocolParser.createLandPacket();
        await sendCommandPacket(landPacket);
    }, 1100);
});

document.getElementById('btn-land').addEventListener('click', async () => {
    console.log("網頁觸發：降落！");
    const packet = DroneProtocolParser.createLandPacket();
    await sendCommandPacket(packet);
});

document.getElementById('btn-stop').addEventListener('click', async () => {
    console.log("網頁觸發：緊急停止！");
    const packet = DroneProtocolParser.createStopPacket();
    await sendCommandPacket(packet);
});
