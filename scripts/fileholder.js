import * as Details from "/scripts/detailsholder.js";

//SDK constants used for parsing 
const NUMFIELDS_BYTE = 5;
const BYTES_PER_FIELD = 3;
const ARCHITECTURE_BYTE = 2;
const GLOBAL_MESG_BYTE = 3;
const DEV_DATA_MASK = 0x20;
const DEV_DATA_BIT = 2; //index of devdata flag bit in def header
const LOCAL_MESG_NUM_MASK = 0x0F;
const LITTLE_ENDIAN = 0;
const BIG_ENDIAN = 1;

//b/c of Def Mesg structure, widths of multiples of 3 >= 6 are best
//as long as there are no developer fields
const DETAILS_ROWLENGTH = 9;

const GRID_ROWLENGTH = 25;

//compressedTimestamp included for completeness; SDK does not decode these yet
const displayDispatch = {
    'definition' : displayDefinition,
    'data' : displayDataMessage,
    'unknown': displayUnknownBytes,
    'error' : displayErrorBytes,
    'fileheader' : displayFileHeader,
    'compressedTimestamp' : null
};

const iconDispatch = {
    'definition' : 'diagram-2.svg',
    'data' : 'clipboard2-data.svg',
    'unknown': 'question.svg',
    'error' : 'exclamation.svg',
    'fileheader' : 'h-circle.svg',
    'compressedTimestamp' : null
};

//to be filled after decoding
let localMessageDefinitions;

//hack for now since we are not using classes
export function setLocalDefinitions(definitions) {
    localMessageDefinitions = definitions;
};

//Indices of section starting bytes and the associated description
//of what that section holds as defined in the Fit SDK
const FileHeaderMap = new Map([
    [0, 'Header Size'],
    [1, 'Protocol Version'],
    [2, 'Profile Version'],
    [4, 'File Data Size (Bytes)'],
    [8, '".FIT" (ASCII)'],
    [12,'CRC value']
]);

//"Number of Fields" key must match NUMFIELDS_BYTE
const DefinitionBaseMap = new Map([
    [0, 'Record Header'],
    [1, 'Reserved Byte'],
    [2, 'Architecture'],
    [3, 'Global Mesg. Num.'],
    [5, 'Num. Fields']
]);

const UnknownMesgMap = new Map([
    [0,'Possible Header'],
    [1,'Unparsed Data']
]);

/**
 * Helper function to interpolate an ordered list of indices/keys so that 
 * the output array can be used to create rows of bytes exactly 'rowLength' 
 * long. In the abstract, this creates an output list where the contents can
 * always be grouped in contiguous blocks with gaps between entries summing 
 * to exactly 'rowLength'.
 * 
 * E.g. an input of ([0,1,5,10], 12, 4) would create an output array of:
 * [0,1,4,5,7,10,11]
 */
function splitKeyList(keyArr, stopKey, rowLength) {
    //TODO this whole thing feels ugly; cleaner approach?
    //TODO what if first entry is not 0?
    
    let cumLength = 0;
    const newArr = [];
    
    //no splitting if everything fits on one row
    //cannot check keyArr directly as final key's block unknown length
    //TODO change key tracking (message maps) to include 'stop' 
    if (rowLength > stopKey)
        return keyArr;
    
    keyArr.forEach(function(key, idx) {
        //every loop inserts a key
        newArr.push(key);
        
        //determine if full block to next key fits
        let nextKey = keyArr[idx+1] ?? stopKey;
        let sliceLength = nextKey - key;
        
        if (cumLength + sliceLength < rowLength) {
            //space remains in row, update and go again
            cumLength += sliceLength;
            
        } else if((cumLength + sliceLength) > rowLength){
            //next full block exceeds space;split into max size pieces to next key
            
            const extra = rowLength - cumLength;     
            for(key += extra; key<nextKey; key += rowLength)
                newArr.push(key); 
            
            //truncate last piece to position of next existing key
            cumLength = nextKey === key ? 0 : nextKey - (key - rowLength);
        } else {
            //exact row length, reset counter
            cumLength = 0;
        }
    });
    
    return newArr;
};

/**
 * Displays the entire file's contents at the message-level
 * resolution, i.e. showing the order of messages and their
 * types, but not further details.
 */
export function displayFile(positionArray) {
    //TODO feels like an unnecessary function to eliminate
    
    let fragment = document.createDocumentFragment();
    const grid = Details.createMesgGrid(positionArray, GRID_ROWLENGTH);
    fragment.append(grid);
    
    return fragment;
};

/**
 * Creates a mapping of byte groups to starting indices based on the info
 * contained in a Definition Message. I.e., given a Definition Message, a 
 * complete mapping of byte group's starting locations depends on the info
 * it itself contains, so the mapping must be created as it is parsed rather
 * than hardcoded in advance (as is possible with the FileHeader)
 */
function createDefinitionMap(bitStrings) {

    let _map = new Map();
    let numFields = parseInt(bitStrings[NUMFIELDS_BYTE],2);
    
    //concatenate 2-byte bitstrings according to little-endian vs big-endian
    let a = parseInt(bitStrings[ARCHITECTURE_BYTE],2) === 0 ? LITTLE_ENDIAN : BIG_ENDIAN;
    let i = GLOBAL_MESG_BYTE;       
    let globalMesgNum = parseInt(bitStrings[i+1-a] + bitStrings[i+a], 2);
    
    //expected # of bytes added to last fixed index and +1 b/c of zero index
    let dataLength = NUMFIELDS_BYTE + 1 + (numFields*BYTES_PER_FIELD);

    let isDeveloperData = bitStrings[0] & DEV_DATA_MASK === DEV_DATA_MASK;
    let numDevFields = isDeveloperData ? parseInt(bitStrings[dataLength], 2) : 0;
    let devDataLen = numDevFields * 3;

    const start_i = NUMFIELDS_BYTE + 1;
    const end_i = start_i + (numFields * 3);
    let fieldnum = 0;
    
    //increment by 3 b/c each field is defined by three consecutive bytes
    for(let i = start_i; i < end_i; i += 3){
        
        //use numbering from 1 for fields since they aren't described like indices
        fieldnum++;
        _map.set(i,`Field ${fieldnum}: Definition Num.`);
        _map.set(i+1,`Field ${fieldnum}: Size (bytes)`);
        _map.set(i+2, `Field ${fieldnum}: Base Type Num.`);
    }

    if (numDevFields === 0)
        return _map;
    
    //TODO untested. Need to find example use of dev fields
    let end_i_dev = end_i + 1 + (numDevFields * 3);
    let devFieldIdx = 0;
    
    for(let i=dataLength + 1; i < numFields; i++){
        _map.set(i, `Dev. Field ${devFieldIdx}`);
        devFieldIdx++;
    }    

    return _map;
};

/**
 * Creates mapping of byte groups for a given Data Message, as defined in the
 * associated Definition Message from the same file.
 */
function createDataMessageMap(bitStrings) {
    //TODO store maps after 1st creation indexed by local mesg num?
    //TODO if local mesg num doesn't exist? It should always if it was decoded
    let _map = new Map([[0,'Header']]);
    let localMesgNum = parseInt(bitStrings[0],2) & LOCAL_MESG_NUM_MASK;
    const def = localMessageDefinitions[localMesgNum];
    let idx = 1;
    
    //TODO if 'name' does not exist or anything else here?
    def.fieldDefinitions.forEach(function(field) {
        //index and field name inserted to map here
        let name = def.fields[field.fieldDefinitionNumber]?.name ?? 'Unknown Field';
        _map.set(idx,name);
        idx += field.size;
    });
    
    return _map;
};

/**
 * Creates blocks of bytes grouped by rows to be used for display. The input 
 * list of bitstrings is subdivided (by byte) as needed to create rows of 
 * even lengths specified by 'rowLength'. '_map' provides information about
 * what groups of bytes represent, mapping a starting index to an object with
 * details.
 */
function createByteRows(bitStrings, _map, keys, rowLength) {
    const nBytes = bitStrings.length;
    //const keys = splitKeyList(Array.from(_map.keys()), nBytes, rowLength);

    const bytes = [];
    let row = [];
    
    let isWrap = false;
    let rowCum = 0;
    let rowNum = 0;
    
    let details;
    
    keys.forEach(function(sliceStart, idx) {
 
        const sliceEnd = keys[idx+1] ?? nBytes;
        const bits = bitStrings.slice(sliceStart,sliceEnd);
        let rightcap = 'closed';
        const leftcap = isWrap ? 'open':'closed';
        isWrap = false;
        
        //update details if starting next byte block, else reuse same post-wrap
        if(_map.has(sliceStart))
            details = _map.get(sliceStart);
        
        //test if this slice completes row or not, or if end of message  
        rowCum += bits.length;
        if(rowCum === rowLength & sliceEnd !== nBytes) {
            //block from this row is split, carries/wraps to start of next row
            if(!_map.has(sliceEnd)) {
                isWrap = true;
                rightcap = 'open';
            }         
        }
        
        row.push({'bitStrings' : bits,
                     'details' : details,
                     'rightcap' : rightcap, 
                     'leftcap' : leftcap,
                     'rowNum' : rowNum});
                     
        if (rowCum === rowLength || idx === (keys.length-1)){
            bytes.push(row);
            if (idx !== (keys.length-1)){
                row = [];
                ++rowNum;
                rowCum = 0;
            }
        }
    });
    
    return bytes;
};

/**
 * Converts binary data read from file into readable binary strings. No 
 * parsing is performed. Each byte is stored as a separate entry in output.
 */
function getBitStrings(stream, byteObj, endByte) {
    //TODO default endByte arg value? What's JS best practice?
    //byteObj has an end value but that may be too long for display
    //how to truncate? pre-func or here?
    
    if (endByte == undefined || endbyte === null)
        endByte = byteObj.length;

    const bitStrings = []; 
    const data = new DataView(stream, byteObj.startByte, endByte);
    
    for (let i = 0; i < data.byteLength; i++)
        bitStrings.push(data.getUint8(i).toString(2).padStart(8,'0'));
       
    return bitStrings;
};

/**
 * Returns a document fragment containing the DOM objects for display
 * of a File Header Message.
 */
function displayFileHeader(byteObj, stream) {
    
    const bitStrings = getBitStrings(stream, byteObj);
    const keys = splitKeyList(Array.from(FileHeaderMap.keys()), 
                              bitStrings.length, DETAILS_ROWLENGTH);                     
    const rows = createByteRows(bitStrings, FileHeaderMap, keys, DETAILS_ROWLENGTH);
    
    return rows;
};

/**
 * Returns a document fragment containing the DOM objects for display
 * of a Definition Message.
 */
function displayDefinition(byteObj, stream) {
    let bitStrings = getBitStrings(stream, byteObj);
    const defMap = new Map([...DefinitionBaseMap, ...createDefinitionMap(bitStrings)]);
    const keys = splitKeyList(Array.from(defMap.keys()), 
                              bitStrings.length, DETAILS_ROWLENGTH);
    const rows = createByteRows(bitStrings, defMap, keys, DETAILS_ROWLENGTH);

    return rows;
};

/**
 * Returns a document fragment containing the DOM objects for display
 * of a Data Message.
 */
function displayDataMessage(byteObj, stream) {
    let bitStrings = getBitStrings(stream, byteObj);
    const mesgMap = createDataMessageMap(bitStrings);
    const keys = splitKeyList(Array.from(mesgMap.keys()), 
                              bitStrings.length, DETAILS_ROWLENGTH);    
    const rows = createByteRows(bitStrings, mesgMap, keys, DETAILS_ROWLENGTH);
    
    return rows;
};

/**
 * Returns a document fragment containing the DOM objects for display
 * of an unknown or non-decoded message. These messages may be those that
 * do have a local definition but without an entry in the SDK profiles --
 * thus not decoded -- or 
 */
function displayUnknownBytes(byteObj, stream) {
    let bitStrings = getBitStrings(stream, byteObj);
    const keys = splitKeyList(Array.from(UnknownMesgMap.keys()), 
                              bitStrings.length, DETAILS_ROWLENGTH);     
    const rows = createByteRows(bitStrings, UnknownMesgMap, keys, DETAILS_ROWLENGTH);

    return rows;
};

/**
 * Returns a document fragment containing the DOM objects for display
 * of bits at and after a read error. Because Read errors stop parsing of
 * the file, the 'error' contents represent the entirety of the remaining
 * data on a file, and may be longer than desired for display. 
 */
function displayErrorBytes(byteObj, stream) {

    //TODO store error message and make it viewable here too
    const preErrBitStrings = getBitStrings(stream, byteObj);
    const postErrBitStrings = getBitStrings(stream, {'startByte' : byteObj.endByte+1});
    const bitStrings = preErrBitStrings.concat(postErrBitStrings);
    
    const ErrMap = new Map([[0,'Unparsed Data'],
                            [byteObj.length, 'Error'],
                            [byteObj.length+1, 'Unread Data']]);
    const keys = splitKeyList(Array.from(ErrMap.keys()), 
                              bitStrings.length, DETAILS_ROWLENGTH);        
    const rows = createByteRows(bitStrings, ErrMap, keys, DETAILS_ROWLENGTH);

    return rows;
};

export function displayDetailCard(idx, type, obj, stream) {

    //TODO error instead and let caller handle it?
    if(!displayDispatch.hasOwnProperty(type))
        return null;
        
    const rows = displayDispatch[type](obj, stream);
    
    /*
    const subtype = (type === 'data') ? 
                    localMessageDefinitions[obj.localMesgNumber]['name'] ?? null :
                    obj.subtype;
    */
      
    const header = Details.createDetailsHeader(obj.type, obj.subtype, obj.has_profile);
    const body = Details.createByteStack(rows); 

    const detailsWrapper = document.createElement('div');
    detailsWrapper.append(header);
    detailsWrapper.append(body);
    
    detailsWrapper.classList = 'details-wrapper';
    detailsWrapper.dataset.role = 'details-card';
    detailsWrapper.dataset.index =  idx;
    
    return detailsWrapper; 
};
