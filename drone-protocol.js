// drone-protocol.js : 協議解析與封包處理
export class DroneProtocolParser {
    constructor(onDataCallback) {
        this.buffer = [];
        this.onDataCallback = onDataCallback;
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

        // 如果想看其他收到的封包，可將註解打開
        // console.log(`收到封包 DataType: 0x${dataType.toString(16).toUpperCase().padStart(2, '0')}, 長度: ${payload.length}`);

        // 針對不同 DataType 進行解析
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

    // 💡 建立主動向裝置請求資料的封包 (Byrobot 協定格式)
    static createRequestPacket(targetDevice, dataType) {
        // [Start1(0x0A), Start2(0x55), DataType, Length(1), Target, ACK/Option, CRC1, CRC2]
        // 簡易請求封包建構
        const packet = [0x0A, 0x55, dataType, 0x01, targetDevice, 0x00];
        
        // 計算簡單的校驗碼或填入預留位元
        let crc = 0;
        for (let i = 2; i < packet.length; i++) {
            crc += packet[i];
        }
        packet.push(crc & 0xFF, (crc >> 8) & 0xFF);
        return new Uint8Array(packet);
    }
}
