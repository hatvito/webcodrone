// app.js : 整合 57600 鮑率與正確狀態輪詢
import { initDigitalTwin } from './digital-twin.js';
import { DroneProtocolParser } from './drone-protocol.js';

const twin = initDigitalTwin('canvas-container');

let port;
let reader;
let pollInterval;
const connectBtn = document.getElementById('connect-btn');
const statusText = document.getElementById('status-text');
const indicator = document.getElementById('connection-indicator');

const parser = new DroneProtocolParser((type, data) => {
    if (type === 'state') {
        console.log(`[硬體回報] 電池: ${data.battery}%, 狀態碼: ${data.flightState}`);
        // 可以在畫面上顯示電池資訊
        document.getElementById('val-front-range').textContent = `電池: ${data.battery}%`;
    }
});

connectBtn.addEventListener('click', async () => {
    try {
        port = await navigator.serial.requestPort();
        // 💡 關鍵修正：鮑率改為正確的 57600
        await port.open({ baudRate: 57600 });

        statusText.textContent = "已連線 (57600)";
        statusText.className = "text-sm text-emerald-400 font-medium";
        indicator.className = "w-3 h-3 bg-emerald-500 rounded-full shadow-[0_0_10px_#10b981]";
        connectBtn.textContent = "已連線";
        connectBtn.disabled = true;
        connectBtn.className = "bg-slate-700 text-slate-400 px-5 py-2 rounded-lg font-medium cursor-not-allowed";

        readSerial();

        // 每秒主動發送一次狀態請求封包（就像剛才 python 腳本一樣）
        pollInterval = setInterval(async () => {
            if (port && port.writable) {
                const writer = port.writable.getWriter();
                await writer.write(DroneProtocolParser.createRequestStatePacket());
                writer.releaseLock();
            }
        }, 1000);

    } catch (err) {
        console.error("序列埠連線失敗：", err);
        alert("無法開啟序列埠，請確認鮑率與硬體連線。");
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
        console.warn("序列埠尚未連線");
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

document.getElementById('btn-takeoff').addEventListener('click', async () => {
    console.log("網頁觸發：起飛！");
    await sendCommandPacket(DroneProtocolParser.createTakeoffPacket());
});

document.getElementById('btn-land').addEventListener('click', async () => {
    console.log("網頁觸發：降落！");
    await sendCommandPacket(DroneProtocolParser.createLandPacket());
});
