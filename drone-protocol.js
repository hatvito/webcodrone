// drone-protocol.js : 全封包透視與 IMU 解析
export class DroneProtocolParser {
    constructor(onDataCallback) {
        this.buffer = [];
        this.onDataCallback = onDataCallback;
        this.packetCount = 0;
    }

    feedData(chunk) {
        this.buffer.push(...chunk);
        this.parse();
    }

    parse() {
        while (this.buffer.length >= 6) {
            let headerIndex = -1;
            for (let i = 0; i < this.buffer.length - 1; i++) {
                if (this.buffer[i] === 0x0A && this.buffer[i+1] === 0x55) {
                    headerIndex = i;
                    break;
                }
            }

            if (headerIndex === -1) {
                this.buffer = this.buffer.slice(-1);
                break;
            }
            if (headerIndex > 0) {
                this.buffer = this.buffer.slice(headerIndex);
            }

            if (this.buffer.length < 4) break;

            let dataType = this.buffer[2];
            let dataLength = this.buffer[3];
            let totalSize = 4 + dataLength + 2;

            if (this.buffer.length < totalSize) break;

            let packet = this.buffer.slice(0, totalSize);
            this.buffer = this.buffer.slice(totalSize);

            this.handlePacket(dataType, packet);
        }
    }

    handlePacket(dataType, packet) {
        const payload = packet.slice(4, packet.length - 2);
        const dataView = new DataView(new Uint8Array(payload).buffer);

        // 限制每秒印出頻率，避免主控台爆掉
        this.packetCount++;
        if (this.packetCount % 30 === 0) {
            console.log(`[封包透視] Type: 0x${dataType.toString(16).toUpperCase()}, 內容(Hex):`, 
                Array.from(payload).map(b => b.toString(16).padStart(2, '0')).join(' ')
            );
        }

        // 針對常見的資料封包進行多種位移嘗試 (假設 Roll/Pitch 藏在前幾個 Int16 或 Int8)
        if (payload.length >= 6) {
            try {
                // 嘗試不同的解析位移與縮放比例
                let val1 = dataView.getInt16(0, true);
                let val2 = dataView.getInt16(2, true);
                let val3 = dataView.getInt16(4, true);

                // 假設這組數據代表姿態或搖桿，我們直接傳遞給 3D 模型看看有沒有反應
                // (這裡先將數值對應到 Roll / Pitch，後面可依觀察結果微調)
                this.onDataCallback('motion', {
                    roll: val1 / 10.0,
                    pitch: val2 / 10.0,
                    yaw: val3 / 10.0
                });
            } catch (e) {
                // 忽略長度不足的例外
            }
        }

        if (dataType === 0x44 && payload.length >= 4) {
            let frontRange = dataView.getInt16(2, true);
            this.onDataCallback('range', { front: frontRange });
        }
    }
}
