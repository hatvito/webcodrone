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
            // 尋找 Header: 0x0A, 0x55
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
            let totalSize = 4 + dataLength + 2; // Header(4) + Payload + CRC(2)

            if (this.buffer.length < totalSize) break;

            let packet = this.buffer.slice(0, totalSize);
            this.buffer = this.buffer.slice(totalSize);

            // 派發解析結果
            this.handlePacket(dataType, packet);
        }
    }

    handlePacket(dataType, packet) {
        const dataView = new DataView(new Uint8Array(packet.slice(6)).buffer);

        if (dataType === 0x30) { // RawMotion (IMU)
            let roll = dataView.getInt16(0, true) / 100.0;
            let pitch = dataView.getInt16(2, true) / 100.0;
            let yaw = dataView.getInt16(4, true) / 100.0;
            this.onDataCallback('motion', { roll, pitch, yaw });
        } 
        else if (dataType === 0x44) { // Range (ToF)
            let frontRange = dataView.getInt16(2, true);
            this.onDataCallback('range', { front: frontRange });
        }
    }
}
