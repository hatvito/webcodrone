// drone-protocol.js : 協議解析與封包處理
export class DroneProtocolParser {
    constructor(onDataCallback) {
        this.buffer = [];
        this.onDataCallback = onDataCallback;
    }

    feedData(chunk) {
        // 將收到的 Uint8Array 轉為普通陣列並推進緩衝區
        this.buffer.push(...chunk);
        this.parse();
    }

    parse() {
        while (this.buffer.length >= 6) {
            // 1. 尋找 Byrobot 封包標頭: 0x0A, 0x55
            let headerIndex = -1;
            for (let i = 0; i < this.buffer.length - 1; i++) {
                if (this.buffer[i] === 0x0A && this.buffer[i+1] === 0x55) {
                    headerIndex = i;
                    break;
                }
            }

            // 如果找不到合法的標頭，清空只留最後一個位元組繼續等下一個
            if (headerIndex === -1) {
                this.buffer = this.buffer.slice(-1);
                break;
            }
            // 如果前面有垃圾資料，將其切掉
            if (headerIndex > 0) {
                this.buffer = this.buffer.slice(headerIndex);
            }

            // 確保有足夠的長度讀取 Header 結構 (StartCode(2) + DataType(1) + Length(1))
            if (this.buffer.length < 4) break;

            let dataType = this.buffer[2];
            let dataLength = this.buffer[3];
            // 總封包大小 = 標頭(4位元組) + 負載資料(dataLength) + CRC校驗碼(2位元組)
            let totalSize = 4 + dataLength + 2;

            // 如果緩衝區收到的資料還不夠一個完整封包，跳出等待下次資料流
            if (this.buffer.length < totalSize) break;

            // 切出完整的一個封包
            let packet = this.buffer.slice(0, totalSize);
            // 移除非當前封包的剩餘緩衝區
            this.buffer = this.buffer.slice(totalSize);

            // 2. 派發解析
            this.handlePacket(dataType, packet);
        }
    }

    handlePacket(dataType, packet) {
        // Payload 從索引 4 開始，一直到倒數第 2 個位元組前（最後 2 個位元組是 CRC16）
        const payload = packet.slice(4, packet.length - 2);
        const dataView = new DataView(new Uint8Array(payload).buffer);

        // 💡 在 F12 主控台印出收到的 DataType，幫助我們確認遙控器吐出的是哪些資料
        console.log(`收到封包 DataType: 0x${dataType.toString(16).toUpperCase().padStart(2, '0')}, 長度: ${payload.length}`);

        // 根據不同的 DataType 解析對應數據
        if (dataType === 0x30) { // RawMotion (IMU 姿態原始數據)
            if (payload.length >= 6) {
                let roll = dataView.getInt16(0, true) / 100.0;
                let pitch = dataView.getInt16(2, true) / 100.0;
                let yaw = dataView.getInt16(4, true) / 100.0;
                this.onDataCallback('motion', { roll, pitch, yaw });
            }
        } 
        else if (dataType === 0x44) { // Range (ToF 測距)
            if (payload.length >= 4) {
                let frontRange = dataView.getInt16(2, true);
                this.onDataCallback('range', { front: frontRange });
            }
        }
    }
}
