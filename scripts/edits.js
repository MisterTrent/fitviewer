import CrcCalculator from "../fitscripts/src/crc-calculator.js";

/**
 * Removes a contiguous segment of bytes from an input ArrayBuffer.
 * The start and end are inclusive. Returns typed array.
 */
export function clipBytes(stream, start, end) {
    //TODO rename, stream is actually arraybuffer
    
    
    //TODO allow this? Return null? 
    if (end < start)
        throw Error('End index is less than start index. Cannot make negative cut');
    
    
    const cut1 = stream.slice(0, start);
    const cut2 = stream.slice(end+1, stream.length);
       
    const arr = new Uint8Array(cut1.byteLength+cut2.byteLength);
    
    arr.set(new Uint8Array(cut1),0);
    arr.set(new Uint8Array(cut2),cut1.byteLength);
    /*
    const newSize = stream.length - (end-start+1);
    const arr = new Uint8Array(stream.slice(0,stream.length));
    arr.set(new Uint8Array(stream.slice(end+1, stream.length)), start);
    
    stream.resize(newSize);
    */
    
    //return typed arr so user can edit if needed (e.g. fit file header)
    return arr;
};

export function updateFileHeader(arr) {
    //TODO handle 12 byte legacy header
    
    const crcSize = 2;
    const headerSize = 14;
    const lengthFieldSize = 4;  //TODO separate this into constant or config file 
    const dataSize = arr.byteLength - headerSize - crcSize;
    
    const lengthBits = dataSize.toString(2).padStart(lengthFieldSize*8,'0');
    const lengthArr = new Uint8Array(lengthFieldSize);
    
    //TODO separate func; don't assume endianness or size of field
    //TODO use bit shifts?
    
    lengthArr[3] = (dataSize & 0xff000000) >> 24;
    lengthArr[2] = (dataSize & 0x00ff0000) >> 16;
    lengthArr[1] = (dataSize & 0x0000ff00) >> 8;
    lengthArr[0] = (dataSize & 0x000000ff);

    //TODO bit operations vs string operation comparison? not really efficiency
    //issue but just to know. Also, see: stackoverflow.com/questions/15761790
    /*
    lengthArr.set(parseInt(lengthBits.substring(24,32),2), 0);
    lengthArr.set(parseInt(lengthBits.substring(16,24),2), 8);
    lengthArr.set(parseInt(lengthBits.substring(8,16),2), 16);
    lengthArr.set(parseInt(lengthBits.substring(0,8),2), 24);        
    */
    
    //TODO move field start position to config
    arr.set(lengthArr, 4);
    
    //calc header crc, TODO header length to config or param
    const h_crc = CrcCalculator.calculateCRC(arr, 0, headerSize-2);
    
    arr[headerSize - 2] = h_crc & 0x00FF; //LSB
    arr[headerSize - 1] = h_crc >> 8; //MSB
    
};

export function updateFileCRC(arr) {
    const crc = CrcCalculator.calculateCRC(arr, 0, arr.byteLength-2);
    
    //little-endian by definition
    arr[arr.byteLength - 2] = crc & 0x00FF;
    arr[arr.byteLength - 1] = crc >> 8;
    
};
