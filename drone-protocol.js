// drone-protocol.js : 修正靜態函數與數據透視
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

        this.packetCount++;
        if (this.packetCount % 30 === 0) {
            console.log(`[封包透視] Type: 0x${dataType.toString(16).toUpperCase()}, 內容(Hex):`, 
                Array.from(payload).map(b => b.toString(16).padStart(2, '0')).join(' ')
            );
        }

        // 💡 嘗試將收到的數值直接映射到 3D 模型的 Roll / Pitch 讓你看到畫面動起來
        if (payload.length >= 4) {
            try {
                // 讀取前兩個位元組作為姿態或搖桿回饋
                let r = dataView.getInt8(0);
                let p = dataView.getInt8(1);
                this.onDataCallback('motion', { roll: r, pitch: p, yaw: 0 });
            } catch (e) {}
        }

        if (dataType === 0x44 && payload.length >= 4) {
            let frontRange = dataView.getInt16(2, true);
            this.onDataCallback('range', { front: frontRange });
        }
    }

    static calculateChecksum(packetArray) {
        let crc = 0;
        for (let i = 2; i < packetArray.length; i++) {
            crc += packetArray[i];
        }
        return [crc & 0xFF, (crc >> 8) & 0xFF];
    }

    // 確保這些靜態方法正確定義，避免 TypeError
    static createPairPacket() {
        let payload = [0x20, 0x00, 0x01, 0x01];
        let packet = [0x0A, 0x55, 0x11, payload.length, ...payload];
        let crc = this.calculateChecksum(packet);
        packet.push(...crc);
        return new Uint8Array(packet);
    }

    static createTakeoffPacket() {
        let payload = [0x20, 0x10, 0x01, 0x01]; 
        let packet = [0x0A, 0x55, 0x11, payload.length, ...payload];
        let crc = this.calculateChecksum(packet);
        packet.push(...crc);
        return new Uint8Array(packet);
    }

    static createLandPacket() {
        let payload = [0x20, 0x10, 0x01, 0x02]; 
        let packet = [0x0A, 0x55, 0x11, payload.length, ...payload];
        let crc = this.calculateChecksum(packet);
        packet.push(...crc);
        return new Uint8Array(packet);
    }

    static createStopPacket() {
        let payload = [0x20, 0x10, 0x01, 0x10]; 
        let packet = [0x0A, 0x55, 0x11, payload.length, ...payload];
        let crc = this.calculateChecksum(packet);
        packet.push(...crc);
        return new Uint8Array(packet);
    }
}
