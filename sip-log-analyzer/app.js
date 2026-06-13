(() => {
    'use strict';
    /**
     * SIP Log Analyzer
     * ----------------
     * This file is intentionally written as plain JavaScript without a build step.
     * The code is split into small sections so the tool can be modified easily:
     *   1. Constants and example data
     *   2. DOM/event binding
     *   3. SIP parsing and normalization
     *   4. Flow/transaction/media analysis
     *   5. Rendering helpers
     */
    const SIP_METHODS = ['INVITE', 'ACK', 'BYE', 'CANCEL', 'OPTIONS', 'REGISTER', 'PRACK', 'UPDATE', 'INFO', 'MESSAGE', 'REFER', 'SUBSCRIBE', 'NOTIFY', 'PUBLISH'];
    const REQUEST_RE = new RegExp(`^(${SIP_METHODS.join('|')})\\s+\\S+\\s+SIP/2\\.0$`, 'i');
    const RESPONSE_RE = /^SIP\/2\.0\s+(\d{3})(?:\s+(.*))?$/i;
    const WRAPPER_RE = /<---\s*(Received|Transmitting)\s+SIP\s+(request|response)\s+\((\d+)\s+bytes\)\s+(from|to)\s+([^\s]+)\s*--->/i;
    const ASTERISK_DATE_RE = /^\[([^\]]+)\]\s+[^:]+:\s*/;
    const PRIVATE_IP_RE = /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[0-1])\.)/;
    // Common static RTP payload types. Dynamic payloads are resolved from a=rtpmap lines.
    const STATIC_RTP_PAYLOADS = {
        '0': 'PCMU/8000',
        '3': 'GSM/8000',
        '4': 'G723/8000',
        '8': 'PCMA/8000',
        '9': 'G722/8000',
        '18': 'G729/8000'
    };
    const sampleLog = `[Jan 02 10:15:00] VERBOSE[1001] res_pjsip_logger.c: <--- Transmitting SIP request (430 bytes) to UDP:198.51.100.20:5060 --->
OPTIONS sip:198.51.100.20:5060 SIP/2.0
Via: SIP/2.0/UDP 192.0.2.10:5060;rport;branch=z9hG4bK-example-options-1
From: <sip:example-trunk@192.0.2.10>;tag=from-options-1
To: <sip:198.51.100.20>
Contact: <sip:example-trunk@192.0.2.10:5060>
Call-ID: example-options-flow-1@example.net
CSeq: 100 OPTIONS
Max-Forwards: 70
User-Agent: Example PBX
Content-Length: 0

[Jan 02 10:15:00] VERBOSE[1002] res_pjsip_logger.c: <--- Received SIP response (360 bytes) from UDP:198.51.100.20:5060 --->
SIP/2.0 200 OK
Via: SIP/2.0/UDP 192.0.2.10:5060;received=203.0.113.10;rport=5060;branch=z9hG4bK-example-options-1
From: <sip:example-trunk@192.0.2.10>;tag=from-options-1
To: <sip:198.51.100.20>;tag=to-options-1
Call-ID: example-options-flow-1@example.net
CSeq: 100 OPTIONS
Server: Example Gateway
Content-Length: 0

[Jan 02 10:16:00] VERBOSE[1003] res_pjsip_logger.c: <--- Received SIP request (620 bytes) from UDP:198.51.100.30:5062 --->
REGISTER sip:192.0.2.10 SIP/2.0
Via: SIP/2.0/UDP 198.51.100.30:5062;branch=z9hG4bK-example-register-1;rport
From: "Example Phone" <sip:1000@example.net>;tag=from-register-1
To: "Example Phone" <sip:1000@example.net>
Call-ID: example-register-flow-1@example.net
CSeq: 10 REGISTER
Contact: <sip:1000@198.51.100.30:5062>;expires=360
User-Agent: Example Phone 1.0
Authorization: Digest username="example-user",realm="example",nonce="old",uri="sip:192.0.2.10",response="example"
Expires: 360
Content-Length: 0

[Jan 02 10:16:00] VERBOSE[1004] res_pjsip_logger.c: <--- Transmitting SIP response (460 bytes) to UDP:198.51.100.30:5062 --->
SIP/2.0 401 Unauthorized
Via: SIP/2.0/UDP 198.51.100.30:5062;rport=5062;received=198.51.100.30;branch=z9hG4bK-example-register-1
From: "Example Phone" <sip:1000@example.net>;tag=from-register-1
To: "Example Phone" <sip:1000@example.net>;tag=to-register-1
Call-ID: example-register-flow-1@example.net
CSeq: 10 REGISTER
WWW-Authenticate: Digest realm="example",nonce="new",stale=true,algorithm=MD5,qop="auth"
Server: Example PBX
Content-Length: 0

[Jan 02 10:16:00] VERBOSE[1003] res_pjsip_logger.c: <--- Received SIP request (620 bytes) from UDP:198.51.100.30:5062 --->
REGISTER sip:192.0.2.10 SIP/2.0
Via: SIP/2.0/UDP 198.51.100.30:5062;branch=z9hG4bK-example-register-2;rport
From: "Example Phone" <sip:1000@example.net>;tag=from-register-1
To: "Example Phone" <sip:1000@example.net>
Call-ID: example-register-flow-1@example.net
CSeq: 11 REGISTER
Contact: <sip:1000@198.51.100.30:5062>;expires=360
User-Agent: Example Phone 1.0
Authorization: Digest username="example-user",realm="example",nonce="new",uri="sip:192.0.2.10",response="example"
Expires: 360
Content-Length: 0

[Jan 02 10:16:00] VERBOSE[1004] res_pjsip_logger.c: <--- Transmitting SIP response (360 bytes) to UDP:198.51.100.30:5062 --->
SIP/2.0 200 OK
Via: SIP/2.0/UDP 198.51.100.30:5062;rport=5062;received=198.51.100.30;branch=z9hG4bK-example-register-2
From: "Example Phone" <sip:1000@example.net>;tag=from-register-1
To: "Example Phone" <sip:1000@example.net>;tag=to-register-2
Call-ID: example-register-flow-1@example.net
CSeq: 11 REGISTER
Contact: <sip:1000@198.51.100.30:5062>;expires=360
Expires: 360
Server: Example PBX
Content-Length: 0

This unrelated application log line should be ignored by the parser.

INVITE sip:2000@example.net SIP/2.0
Via: SIP/2.0/UDP 192.0.2.10:5060;branch=z9hG4bK-example-invite-1
From: <sip:1000@example.net>;tag=caller-1
To: <sip:2000@example.net>
Call-ID: example-call-flow-1@example.net
CSeq: 1 INVITE
Contact: <sip:1000@192.0.2.10:5060>
Content-Type: application/sdp
Content-Length: 226

v=0
o=- 1 1 IN IP4 192.0.2.10
s=-
c=IN IP4 192.0.2.10
t=0 0
m=audio 4000 RTP/AVP 0 8 9 101
a=rtpmap:0 PCMU/8000
a=rtpmap:8 PCMA/8000
a=rtpmap:9 G722/8000
a=rtpmap:101 telephone-event/8000
m=video 5000 RTP/AVP 96
a=rtpmap:96 H264/90000

SIP/2.0 200 OK
Via: SIP/2.0/UDP 192.0.2.10:5060;branch=z9hG4bK-example-invite-1
From: <sip:1000@example.net>;tag=caller-1
To: <sip:2000@example.net>;tag=callee-1
Call-ID: example-call-flow-1@example.net
CSeq: 1 INVITE
Contact: <sip:2000@198.51.100.40:5060>
Content-Type: application/sdp
Content-Length: 189

v=0
o=- 2 2 IN IP4 198.51.100.40
s=-
c=IN IP4 198.51.100.40
t=0 0
m=audio 4100 RTP/AVP 8 101
a=rtpmap:8 PCMA/8000
a=rtpmap:101 telephone-event/8000
m=video 5100 RTP/AVP 96
a=rtpmap:96 H264/90000

ACK sip:2000@198.51.100.40:5060 SIP/2.0
Via: SIP/2.0/UDP 192.0.2.10:5060;branch=z9hG4bK-example-ack-1
From: <sip:1000@example.net>;tag=caller-1
To: <sip:2000@example.net>;tag=callee-1
Call-ID: example-call-flow-1@example.net
CSeq: 1 ACK
Content-Length: 0`
    const state = {
        messages: [],
        flows: [],
        activeTab: 'overview',
        selectedCallId: '__all__',
        filter: ''
    };
    const el = {};
    if (typeof document !== 'undefined') {
        document.addEventListener('DOMContentLoaded', () => {
            bindElements();
            bindEvents();
            render();
        });
    }
    // Cache DOM nodes once. This keeps the rest of the code readable and avoids repeated lookups.
    function bindElements() {
        el.input = document.getElementById('log-input');
        el.output = document.getElementById('output');
        el.status = document.getElementById('parse-status');
        el.filter = document.getElementById('filter-input');
        el.flowSelect = document.getElementById('flow-select');
        el.dropZone = document.getElementById('drop-zone');
        el.fileInput = document.getElementById('file-input');
        el.copyClean = document.getElementById('copy-clean');
        el.downloadClean = document.getElementById('download-clean');
    }
    // Wire UI events. Parsing is debounced so large pasted logs do not re-render on every keystroke.
    function bindEvents() {
        const parseNow = debounce(() => analyzeInput(), 120);
        el.input.addEventListener('input', parseNow);
        el.filter.addEventListener('input', () => {
            state.filter = el.filter.value.trim().toLowerCase();
            render();
        });
        el.flowSelect.addEventListener('change', () => {
            state.selectedCallId = el.flowSelect.value;
            render();
        });
        document.getElementById('load-example').addEventListener('click', loadExample);
        document.getElementById('clear-input').addEventListener('click', () => {
            el.input.value = '';
            analyzeInput();
            el.input.focus();
        });
        document.querySelectorAll('.tab').forEach(tab => tab.addEventListener('click', () => {
            state.activeTab = tab.dataset.tab;
            document.querySelectorAll('.tab').forEach(t => {
                const active = t === tab;
                t.classList.toggle('active', active);
                t.setAttribute('aria-selected', active ? 'true' : 'false');
            });
            render();
        }));
        el.copyClean.addEventListener('click', async () => {
            const text = cleanSip(selectedMessages());
            if (!text) return;
            try {
                await navigator.clipboard.writeText(text);
                flashButton(el.copyClean, 'Copied');
            } catch {
                fallbackCopy(text);
                flashButton(el.copyClean, 'Copied');
            }
        });
        el.downloadClean.addEventListener('click', () => {
            const text = cleanSip(selectedMessages());
            if (!text) return;
            const blob = new Blob([text], {
                type: 'text/plain;charset=utf-8'
            });
            const link = document.createElement('a');
            link.href = URL.createObjectURL(blob);
            link.download = `clean-sip-trace-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.txt`;
            link.click();
            URL.revokeObjectURL(link.href);
        });
        el.dropZone.addEventListener('click', () => el.fileInput.click());
        el.dropZone.addEventListener('keydown', ev => {
            if (ev.key === 'Enter' || ev.key === ' ') {
                ev.preventDefault();
                el.fileInput.click();
            }
        });
        el.fileInput.addEventListener('change', () => readFile(el.fileInput.files[0]));
        ['dragenter', 'dragover'].forEach(eventName => el.dropZone.addEventListener(eventName, ev => {
            ev.preventDefault();
            el.dropZone.classList.add('drag-over');
        }));
        ['dragleave', 'drop'].forEach(eventName => el.dropZone.addEventListener(eventName, ev => {
            ev.preventDefault();
            el.dropZone.classList.remove('drag-over');
        }));
        el.dropZone.addEventListener('drop', ev => readFile(ev.dataTransfer.files[0]));
    }

    function loadExample() {
        el.input.value = sampleLog;
        analyzeInput();
        document.getElementById('tool').scrollIntoView({
            behavior: 'smooth',
            block: 'start'
        });
    }

    function readFile(file) {
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => {
            el.input.value = String(reader.result || '');
            analyzeInput();
        };
        reader.readAsText(file);
    }
    // Main entry point after input changes: parse messages, group flows, refresh the UI.
    function analyzeInput() {
        const messages = parseSipLog(el.input.value || '');
        state.messages = messages;
        state.flows = buildFlows(messages);
        if (state.selectedCallId !== '__all__' && !state.flows.some(flow => flow.callId === state.selectedCallId)) state.selectedCallId = '__all__';
        updateFlowSelect();
        render();
    }
    // Extract SIP messages from raw SIP, Asterisk PJSIP logger output, or mixed logs.
    // Non-SIP lines are ignored instead of causing the full parse to fail.
    function parseSipLog(input) {
        const normalized = input.replace(/\r\n?/g, '\n');
        const lines = normalized.split('\n');
        const messages = [];
        let pendingWrapper = null;
        let current = null;
        let contentRemaining = 0;
        const finishCurrent = () => {
            if (!current) return;
            const msg = finalizeMessage(current, messages.length + 1);
            if (msg) messages.push(msg);
            current = null;
            contentRemaining = 0;
        };
        for (let i = 0; i < lines.length; i++) {
            const originalLine = lines[i];
            const stripped = stripAsteriskPrefix(originalLine);
            const wrapper = parseWrapper(stripped);
            // A wrapper line always starts a new SIP block in Asterisk PJSIP output.
            if (wrapper) {
                finishCurrent();
                pendingWrapper = {
                    ...wrapper,
                    lineNumber: i + 1,
                    wrapperLine: originalLine.trim()
                };
                continue;
            }
            const line = stripped;
            const startsSip = isSipStartLine(line);
            if (current) {
                // Raw SIP traces may place messages directly after each other without an
                // Asterisk wrapper. Once we already have a complete header block, a new
                // SIP request/status line is a safer boundary than Content-Length. This
                // is important for copied logs where CRLF was normalized to LF, or where
                // tools pasted a slightly wrong Content-Length for an SDP body.
                if (startsSip && headerComplete(current.lines)) {
                    finishCurrent();
                    current = startMessage(line, pendingWrapper, i + 1);
                    pendingWrapper = null;
                    contentRemaining = expectedBodyBytesRemaining(current.lines);
                    continue;
                }
                // A blank line after at least one body line normally separates SIP
                // messages in pasted/raw traces. Do not confuse it with the required
                // blank line between headers and the body.
                if (line === '' && bodyStarted(current.lines)) {
                    finishCurrent();
                    pendingWrapper = null;
                    continue;
                }
                // Content-Length is still useful while consuming the current message,
                // but the parser intentionally treats it as advisory because many logs
                // are copied through tools that change line endings.
                current.lines.push(line);
                contentRemaining = expectedBodyBytesRemaining(current.lines);
                continue;
            }
            // Ignore unrelated log noise until a valid SIP request/status line appears.
            if (startsSip) {
                current = startMessage(line, pendingWrapper, i + 1);
                pendingWrapper = null;
                contentRemaining = expectedBodyBytesRemaining(current.lines);
            } else if (line.trim() !== '' && !looksLikeContinuationNoise(line)) {
                pendingWrapper = null;
            }
        }
        finishCurrent();
        return messages;
    }

    function stripAsteriskPrefix(line) {
        return line.replace(ASTERISK_DATE_RE, '');
    }
    // Read Asterisk PJSIP logger wrapper lines, for example:
    // <--- Received SIP request (...) from UDP:example:5060 --->
    function parseWrapper(line) {
        const m = line.match(WRAPPER_RE);
        if (!m) return null;
        return {
            direction: m[1].toLowerCase() === 'received' ? 'received' : 'transmitting',
            kind: m[2].toLowerCase(),
            bytes: Number(m[3]),
            remote: m[5]
        };
    }

    function isSipStartLine(line) {
        return REQUEST_RE.test(line.trim()) || RESPONSE_RE.test(line.trim());
    }

    function startMessage(line, wrapper, lineNumber) {
        return {
            lines: [line],
            wrapper,
            lineNumber
        };
    }

    function looksLikeContinuationNoise(line) {
        return /^\s/.test(line) || /^[A-Za-z0-9_-]+:\s*/.test(line) || /^[a-z]=/.test(line);
    }

    function headerComplete(lines) {
        return lines.includes('') || lines.some(line => /^Content-Length\s*:\s*0\s*$/i.test(line));
    }

    function bodyStarted(lines) {
        const emptyIndex = lines.indexOf('');
        return emptyIndex >= 0 && lines.length > emptyIndex + 1;
    }

    function expectedBodyBytesRemaining(lines) {
        const emptyIndex = lines.indexOf('');
        if (emptyIndex < 0) return 0;
        const lengthLine = lines.slice(0, emptyIndex).find(line => /^Content-Length\s*:/i.test(line));
        if (!lengthLine) return 0;
        const bytes = Number((lengthLine.split(':')[1] || '').trim());
        if (!bytes) return 0;
        const body = lines.slice(emptyIndex + 1).join('\n');
        return Math.max(0, bytes - body.length);
    }
    // Convert a collected SIP block into normalized metadata used by all views.
    function finalizeMessage(raw, index) {
        const cleanLines = trimTrailingBlank(raw.lines);
        if (!cleanLines.length || !isSipStartLine(cleanLines[0])) return null;
        // Split SIP into start-line, headers and optional body/SDP.
        const headerEnd = cleanLines.indexOf('');
        const headerLines = headerEnd >= 0 ? cleanLines.slice(1, headerEnd) : cleanLines.slice(1);
        const bodyLines = headerEnd >= 0 ? cleanLines.slice(headerEnd + 1) : [];
        const headers = parseHeaders(headerLines);
        const startLine = cleanLines[0].trim();
        const responseMatch = startLine.match(RESPONSE_RE);
        const requestMatch = startLine.match(REQUEST_RE);
        const cseq = parseCSeq(getHeader(headers, 'cseq'));
        // Prefer the PJSIP wrapper endpoint; fall back to Via for raw SIP traces.
        const remoteFromHeaders = raw.wrapper?.remote || inferRemoteFromTopVia(headers) || '';
        const direction = raw.wrapper?.direction || inferDirection(startLine);
        const callId = getHeader(headers, 'call-id') || getHeader(headers, 'i') || '(missing Call-ID)';
        const from = getHeader(headers, 'from') || getHeader(headers, 'f') || '';
        const to = getHeader(headers, 'to') || getHeader(headers, 't') || '';
        const contact = getHeader(headers, 'contact') || getHeader(headers, 'm') || '';
        const userAgent = getHeader(headers, 'user-agent') || getHeader(headers, 'server') || '';
        const via = getHeader(headers, 'via') || getHeader(headers, 'v') || '';
        const auth = Boolean(getHeader(headers, 'authorization') || getHeader(headers, 'proxy-authorization'));
        const challenge = Boolean(getHeader(headers, 'www-authenticate') || getHeader(headers, 'proxy-authenticate'));
        const sdp = bodyLines.join('\n');
        return {
            index,
            lineNumber: raw.lineNumber,
            wrapperLine: raw.wrapper?.wrapperLine || '',
            direction,
            kind: responseMatch ? 'response' : 'request',
            startLine,
            method: responseMatch ? cseq.method || 'RESPONSE' : requestMatch[1].toUpperCase(),
            status: responseMatch ? Number(responseMatch[1]) : null,
            reason: responseMatch ? (responseMatch[2] || '').trim() : '',
            uri: requestMatch ? startLine.split(/\s+/)[1] : '',
            callId: callId.trim(),
            cseqNumber: cseq.number,
            cseqMethod: cseq.method,
            transactionId: `${callId.trim()}::${cseq.number || '?'}::${cseq.method || (requestMatch ? requestMatch[1].toUpperCase() : 'RESPONSE')}`,
            headers,
            from,
            to,
            contact,
            userAgent,
            via,
            remote: remoteFromHeaders,
            remoteLabel: friendlyEndpoint(remoteFromHeaders, contact || from || to),
            hasAuth: auth,
            hasChallenge: challenge,
            hasSdp: /^Content-Type\s*:\s*application\/sdp/im.test(cleanLines.join('\n')) || /^v=0/m.test(sdp),
            sdpConnectionIp: extractSdpConnectionIp(sdp),
            sdpMedia: parseSdpMedia(sdp),
            raw: cleanLines.join('\n').trimEnd()
        };
    }

    function trimTrailingBlank(lines) {
        const copy = lines.slice();
        while (copy.length && copy[copy.length - 1] === '') copy.pop();
        return copy;
    }
    // Parse SIP headers and fold continuation lines according to SIP/HTTP-style header rules.
    function parseHeaders(lines) {
        const headers = [];
        let current = null;
        lines.forEach(line => {
            if (/^[ \t]/.test(line) && current) {
                current.value += ' ' + line.trim();
                return;
            }
            const idx = line.indexOf(':');
            if (idx <= 0) return;
            current = {
                name: line.slice(0, idx).trim(),
                value: line.slice(idx + 1).trim()
            };
            headers.push(current);
        });
        return headers;
    }

    function getHeader(headers, name) {
        const wanted = name.toLowerCase();
        const found = headers.find(h => h.name.toLowerCase() === wanted);
        return found ? found.value : '';
    }

    function parseCSeq(value) {
        const m = String(value || '').trim().match(/^(\d+)\s+([A-Z]+)$/i);
        return {
            number: m ? Number(m[1]) : null,
            method: m ? m[2].toUpperCase() : ''
        };
    }

    function inferDirection(startLine) {
        return RESPONSE_RE.test(startLine) ? 'received' : 'unknown';
    }

    function inferRemoteFromTopVia(headers) {
        const via = getHeader(headers, 'via') || getHeader(headers, 'v');
        const m = via.match(/SIP\/2\.0\/\w+\s+([^;\s]+)/i);
        return m ? m[1] : '';
    }

    function friendlyEndpoint(remote, fallback) {
        const cleanRemote = String(remote || '').replace(/^(UDP|TCP|TLS|WS|WSS):/i, '');
        const sip = String(fallback || '').match(/sip:([^>;,\s]+)/i);
        if (sip && cleanRemote) return `${sip[1]} (${cleanRemote})`;
        return cleanRemote || (sip ? sip[1] : 'unknown endpoint');
    }

    function extractSdpConnectionIp(sdp) {
        const m = String(sdp || '').match(/^c=IN\s+IP4\s+([^\s]+)/mi);
        return m ? m[1] : '';
    }
    // Parse SDP media sections. The analyzer only needs enough SDP to answer:
    // "which audio/video codecs were offered and which were accepted?"
    function parseSdpMedia(sdp) {
        const text = String(sdp || '').trim();
        if (!text) return [];
        const lines = text.split('\n').map(line => line.trim()).filter(Boolean);
        const media = [];
        let sessionConnectionIp = '';
        let current = null;
        lines.forEach(line => {
            if (/^c=IN\s+IP4\s+/i.test(line)) {
                const ip = line.replace(/^c=IN\s+IP4\s+/i, '').split(/\s+/)[0];
                if (current) current.connectionIp = ip;
                else sessionConnectionIp = ip;
                return;
            }
            if (/^m=/i.test(line)) {
                const parts = line.slice(2).trim().split(/\s+/);
                current = {
                    type: (parts[0] || '').toLowerCase(),
                    port: parts[1] || '',
                    protocol: parts[2] || '',
                    payloads: parts.slice(3),
                    rtpmap: {},
                    connectionIp: sessionConnectionIp,
                    codecs: []
                };
                media.push(current);
                return;
            }
            if (current && /^a=rtpmap:/i.test(line)) {
                const match = line.match(/^a=rtpmap:([^\s]+)\s+(.+)$/i);
                if (match) current.rtpmap[match[1]] = match[2].trim();
            }
        });
        media.forEach(section => {
            section.codecs = section.payloads.map(payload => {
                const codec = section.rtpmap[payload] || STATIC_RTP_PAYLOADS[payload] || `PT ${payload}`;
                return {
                    payload,
                    codec,
                    name: codec.split('/')[0].toUpperCase(),
                    isDtmf: /^telephone-event/i.test(codec)
                };
            });
        });
        return media;
    }
    // Compare offer/answer SDP in call-like flows. The answer side is treated as
    // negotiated/used because SIP answers reduce the offered codec set to what was accepted.
    function analyzeCodecNegotiation(messages) {
        const sessions = [];
        const byTransaction = analyzeTransactions(messages);
        byTransaction.forEach(tx => {
            // SIP offer/answer is transaction based: request with SDP, response with SDP.
            const offer = tx.request;
            if (!offer || !offer.hasSdp || !['INVITE', 'UPDATE'].includes(offer.method)) return;
            const answer = tx.responses.find(message => message.hasSdp && message.status >= 200 && message.status < 300) || tx.responses.find(message => message.hasSdp && message.status >= 180 && message.status < 200);
            sessions.push({
                method: offer.method,
                cseq: offer.cseqNumber,
                offer,
                answer: answer || null,
                audio: compareMedia('audio', offer, answer),
                video: compareMedia('video', offer, answer)
            });
        });
        return {
            sessions,
            latest: sessions[sessions.length - 1] || null,
            hasMedia: sessions.length > 0
        };
    }

    function compareMedia(type, offer, answer) {
        const offered = mediaCodecs(offer, type);
        const answered = mediaCodecs(answer, type);
        const negotiated = answered.length ? answered : [];
        const offeredOnly = offered.filter(codec => !answered.some(answerCodec => sameCodec(codec, answerCodec)));
        return {
            type,
            offered,
            negotiated,
            offeredOnly,
            status: answered.length ? 'negotiated' : offered.length ? 'offered-only' : 'not-present'
        };
    }

    function mediaCodecs(message, type) {
        if (!message) return [];
        return (message.sdpMedia || []).filter(section => section.type === type).flatMap(section => section.codecs).filter(codec => !codec.isDtmf);
    }

    function sameCodec(a, b) {
        return a.name === b.name || a.codec.toUpperCase() === b.codec.toUpperCase() || a.payload === b.payload;
    }
    // Group messages by Call-ID. REGISTER and OPTIONS are treated as first-class flows, not only calls.
    function buildFlows(messages) {
        const byCallId = new Map();
        messages.forEach(message => {
            if (!byCallId.has(message.callId)) byCallId.set(message.callId, []);
            byCallId.get(message.callId).push(message);
        });
        return [...byCallId.entries()].map(([callId, flowMessages]) => analyzeFlow(callId, flowMessages)).sort((a, b) => a.firstIndex - b.firstIndex);
    }
    // Build a summary for one Call-ID, including transactions, health hints and media codecs.
    function analyzeFlow(callId, messages) {
        const methods = [...new Set(messages.map(m => m.method).filter(Boolean))];
        const statuses = messages.filter(m => m.status).map(m => m.status);
        const failures = statuses.filter(code => code >= 400);
        const finalStatuses = statuses.filter(code => code >= 200);
        const authChallenges = messages.filter(m => m.status === 401 || m.status === 407).length;
        const successes = statuses.filter(code => code >= 200 && code < 300).length;
        const endpoints = [...new Set(messages.map(m => m.remoteLabel).filter(Boolean))];
        const userAgents = [...new Set(messages.map(m => m.userAgent).filter(Boolean))];
        const sdpPrivate = messages.filter(m => m.sdpConnectionIp && PRIVATE_IP_RE.test(m.sdpConnectionIp));
        const transactions = analyzeTransactions(messages);
        const mediaNegotiation = analyzeCodecNegotiation(messages);
        const title = flowTitle(methods, messages);
        const status = flowStatus(messages, failures, finalStatuses, authChallenges, successes);
        const insights = flowInsights(methods, messages, transactions, authChallenges, successes, failures, sdpPrivate, mediaNegotiation);
        return {
            callId,
            title,
            messages,
            methods,
            statuses,
            failures,
            authChallenges,
            successes,
            endpoints,
            userAgents,
            sdpPrivate,
            mediaNegotiation,
            transactions,
            status,
            insights,
            firstIndex: messages[0]?.index || 0,
            lastIndex: messages[messages.length - 1]?.index || 0
        };
    }

    function analyzeTransactions(messages) {
        const map = new Map();
        messages.forEach(message => {
            const key = message.transactionId;
            if (!map.has(key)) map.set(key, {
                key,
                cseq: message.cseqNumber,
                method: message.cseqMethod || message.method,
                request: null,
                responses: [],
                messages: []
            });
            const tx = map.get(key);
            tx.messages.push(message);
            if (message.kind === 'request') tx.request = message;
            if (message.kind === 'response') tx.responses.push(message);
        });
        return [...map.values()].map(tx => ({
            ...tx,
            finalResponse: [...tx.responses].reverse().find(m => m.status >= 200) || null,
            provisionalResponses: tx.responses.filter(m => m.status && m.status < 200)
        }));
    }

    function flowTitle(methods, messages) {
        if (methods.length === 1) return `${methods[0]} flow`;
        const hasInvite = methods.includes('INVITE');
        if (hasInvite) return 'Call flow';
        if (methods.includes('REGISTER')) return 'Registration flow';
        if (methods.includes('OPTIONS')) return 'OPTIONS qualify flow';
        return `${methods.slice(0, 3).join(', ')} flow`;
    }

    function flowStatus(messages, failures, finalStatuses, authChallenges, successes) {
        const methods = new Set(messages.map(m => m.method));
        if (failures.some(code => code >= 500)) return {
            level: 'bad',
            label: 'Server failure'
        };
        if (methods.has('REGISTER') && successes > 0) return {
            level: 'ok',
            label: authChallenges ? 'Registered after challenge' : 'Registered'
        };
        if (methods.has('OPTIONS') && successes > 0) return {
            level: 'ok',
            label: authChallenges ? 'OPTIONS challenged' : 'OPTIONS OK'
        };
        if (failures.length && failures.every(code => code === 401 || code === 407) && authChallenges) return {
            level: 'warn',
            label: 'Auth challenge only'
        };
        if (failures.length) return {
            level: 'bad',
            label: `${failures.length} failed response${failures.length === 1 ? '' : 's'}`
        };
        if (finalStatuses.length) return {
            level: 'ok',
            label: 'Completed'
        };
        return {
            level: 'warn',
            label: 'No final response'
        };
    }

    function flowInsights(methods, messages, transactions, authChallenges, successes, failures, sdpPrivate, mediaNegotiation) {
        const insights = [];
        const methodSet = new Set(methods);
        if (methodSet.has('REGISTER')) {
            const registerRequests = messages.filter(m => m.kind === 'request' && m.method === 'REGISTER');
            const expires = registerRequests.map(m => getHeader(m.headers, 'expires')).filter(Boolean).pop();
            if (authChallenges && successes) insights.push({
                level: 'ok',
                text: `REGISTER completed after ${authChallenges} authentication challenge${authChallenges === 1 ? '' : 's'}.`
            });
            else if (authChallenges && !successes) insights.push({
                level: 'warn',
                text: 'REGISTER was challenged but no successful 200 OK was found in this trace.'
            });
            else if (successes) insights.push({
                level: 'ok',
                text: 'REGISTER completed successfully.'
            });
            if (expires) insights.push({
                level: 'info',
                text: `Requested registration expiry: ${expires} seconds.`
            });
        }
        if (methodSet.has('OPTIONS')) {
            const ok = messages.some(m => m.method === 'OPTIONS' && m.status >= 200 && m.status < 300);
            const challenged = messages.some(m => m.method === 'OPTIONS' && (m.status === 401 || m.status === 407));
            if (ok) insights.push({
                level: 'ok',
                text: 'OPTIONS qualify/keepalive received a successful response.'
            });
            if (challenged && !ok) insights.push({
                level: 'warn',
                text: 'OPTIONS was challenged and no successful retry is visible. Some trunks expect authenticated OPTIONS, others do not.'
            });
            if (challenged && ok) insights.push({
                level: 'info',
                text: 'OPTIONS authentication challenge detected before a successful response.'
            });
        }
        const missingResponses = transactions.filter(tx => tx.request && !tx.responses.length);
        if (missingResponses.length) insights.push({
            level: 'warn',
            text: `${missingResponses.length} transaction${missingResponses.length === 1 ? '' : 's'} have a request but no response in the parsed trace.`
        });
        const realFailures = failures.filter(code => code !== 401 && code !== 407);
        if (realFailures.length) insights.push({
            level: 'bad',
            text: `Detected failed SIP responses: ${[...new Set(realFailures)].join(', ')}.`
        });
        if (sdpPrivate.length) insights.push({
            level: 'warn',
            text: `${sdpPrivate.length} message${sdpPrivate.length === 1 ? '' : 's'} contain private SDP connection IPs. This can be normal on LANs, but is a NAT clue for internet trunks.`
        });
        if (!insights.length) insights.push({
            level: 'info',
            text: 'No obvious SIP problems detected in this flow.'
        });
        return insights;
    }

    function updateFlowSelect() {
        const options = [`<option value="__all__">All flows (${state.flows.length})</option>`].concat(state.flows.map(flow => `<option value="${escapeAttr(flow.callId)}">${escapeHtml(flow.title)} - ${escapeHtml(shortId(flow.callId))}</option>`));
        el.flowSelect.innerHTML = options.join('');
        el.flowSelect.value = state.selectedCallId;
    }

    function filteredMessages() {
        const base = state.selectedCallId === '__all__' ? state.messages : state.messages.filter(m => m.callId === state.selectedCallId);
        if (!state.filter) return base;
        return base.filter(message => searchableText(message).includes(state.filter));
    }

    function selectedMessages() {
        return filteredMessages();
    }

    function selectedFlows() {
        const base = state.selectedCallId === '__all__' ? state.flows : state.flows.filter(flow => flow.callId === state.selectedCallId);
        if (!state.filter) return base;
        return base.map(flow => ({
            ...flow,
            messages: flow.messages.filter(message => searchableText(message).includes(state.filter))
        })).filter(flow => flow.messages.length || searchableFlow(flow).includes(state.filter));
    }

    function searchableText(message) {
        return [message.startLine, message.callId, message.method, message.status, message.reason, message.remote, message.remoteLabel, message.from, message.to, message.contact, message.userAgent, (message.sdpMedia || []).flatMap(section => section.codecs.map(codec => codec.codec)).join(' '), message.raw].join(' ').toLowerCase();
    }

    function searchableFlow(flow) {
        return [flow.callId, flow.title, flow.status.label, flow.methods.join(' '), flow.endpoints.join(' '), flow.userAgents.join(' '), renderMediaText(flow.mediaNegotiation?.latest || {}).toLowerCase()].join(' ').toLowerCase();
    }
    // Pick the active view and render it. Views always use filtered/selected messages.
    function render() {
        updateStatus();
        el.copyClean.disabled = selectedMessages().length === 0;
        el.downloadClean.disabled = selectedMessages().length === 0;
        if (!state.messages.length) {
            el.output.innerHTML = `<div class="empty-state"><div><strong>No SIP messages found yet</strong><span>Paste raw SIP, Asterisk PJSIP logs, or load the example.</span></div></div>`;
            return;
        }
        if (state.activeTab === 'overview') renderOverview();
        if (state.activeTab === 'flows') renderFlows();
        if (state.activeTab === 'messages') renderMessages();
        if (state.activeTab === 'clean') renderClean();
    }

    function updateStatus() {
        const m = state.messages.length;
        const f = state.flows.length;
        const filtered = selectedMessages().length;
        el.status.textContent = m ? `${m} SIP message${m === 1 ? '' : 's'} parsed in ${f} flow${f === 1 ? '' : 's'}${filtered !== m ? ` (${filtered} visible)` : ''}.` : 'No SIP messages parsed yet.';
    }

    function renderOverview() {
        const messages = selectedMessages();
        const flows = selectedFlows();
        const requests = messages.filter(m => m.kind === 'request').length;
        const responses = messages.length - requests;
        const failures = messages.filter(m => m.status >= 400).length;
        const authChallenges = messages.filter(m => m.status === 401 || m.status === 407).length;
        const methods = countBy(messages.map(m => m.method));
        const statuses = countBy(messages.filter(m => m.status).map(m => String(m.status)));
        const userAgents = [...new Set(messages.map(m => m.userAgent).filter(Boolean))].slice(0, 8);
        const sdpPrivate = messages.filter(m => m.sdpConnectionIp && PRIVATE_IP_RE.test(m.sdpConnectionIp));
        const codecFlows = flows.filter(flow => flow.mediaNegotiation?.latest).length;
        el.output.innerHTML = `
      <div class="metric-grid">
        <div class="metric"><strong>${messages.length}</strong><span>SIP messages</span></div>
        <div class="metric"><strong>${flows.length}</strong><span>Call-ID flows</span></div>
        <div class="metric"><strong>${requests}</strong><span>Requests</span></div>
        <div class="metric"><strong>${responses}</strong><span>Responses</span></div>
      </div>
      <div class="notice-grid">
        ${failures ? `<div class="notice ${failures === authChallenges ? 'warn' : 'bad'}"><strong>${failures} 4xx/5xx/6xx response${failures === 1 ? '' : 's'}.</strong> ${authChallenges ? `${authChallenges} are authentication challenges.` : 'Open the flows view to inspect them.'}</div>` : `<div class="notice ok"><strong>No failed SIP responses in the visible messages.</strong></div>`}
        ${sdpPrivate.length ? `<div class="notice warn"><strong>Private SDP connection IP detected.</strong> ${sdpPrivate.length} visible message${sdpPrivate.length === 1 ? '' : 's'} contain private media addresses.</div>` : ''}
        ${codecFlows ? `<div class="notice info"><strong>Codec negotiation found.</strong> ${codecFlows} visible flow${codecFlows === 1 ? '' : 's'} include SDP offer/answer media details.</div>` : ''}
      </div>
      <div class="grid grid--2">
        <article class="card"><h3>Methods</h3>${renderCounts(methods)}</article>
        <article class="card"><h3>Status codes</h3>${renderCounts(statuses) || '<p class="muted">No responses found.</p>'}</article>
      </div>
      ${userAgents.length ? `<h3 style="margin-top: 14px;">User agents / servers</h3><div class="tags">${userAgents.map(ua => `<span class="tag">${escapeHtml(ua)}</span>`).join('')}</div>` : ''}
    `;
    }

    function renderCounts(counts) {
        const rows = Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([name, count]) => `<span class="tag">${escapeHtml(name)}: ${count}</span>`).join('');
        return rows ? `<div class="tags">${rows}</div>` : '';
    }

    function renderFlows() {
        const flows = selectedFlows();
        el.output.innerHTML = `<div class="flow-list">${flows.map(renderFlowCard).join('') || '<div class="empty-state"><div><strong>No matching flows</strong><span>Try clearing the filter.</span></div></div>'}</div>`;
        el.output.querySelectorAll('[data-select-flow]').forEach(button => button.addEventListener('click', () => {
            state.selectedCallId = button.dataset.selectFlow;
            el.flowSelect.value = state.selectedCallId;
            render();
        }));
    }
    // Render one flow card. Keep this compact; detailed SIP stays in Messages/Clean SIP.
    function renderFlowCard(flow) {
        const selected = state.selectedCallId === flow.callId;
        const firstLast = flow.firstIndex === flow.lastIndex ? `#${flow.firstIndex}` : `#${flow.firstIndex}-#${flow.lastIndex}`;
        return `
      <article class="flow-card ${selected ? 'selected' : ''}">
        <div class="flow-top">
          <div class="flow-title">
            <strong>${escapeHtml(flow.title)} <span class="tag ${flow.status.level}">${escapeHtml(flow.status.label)}</span></strong>
            <small class="mono">${escapeHtml(flow.callId)}</small>
          </div>
          <div class="flow-actions">
            <button type="button" data-select-flow="${escapeAttr(flow.callId)}">Inspect</button>
          </div>
        </div>
        <div class="tags">
          <span class="tag">${flow.messages.length} messages</span>
          <span class="tag">${firstLast}</span>
          ${flow.methods.map(method => `<span class="tag info">${escapeHtml(method)}</span>`).join('')}
          ${flow.failures.length ? `<span class="tag ${flow.failures.every(code => code === 401 || code === 407) ? 'warn' : 'bad'}">${flow.failures.length} failed/challenge</span>` : '<span class="tag ok">no failed responses</span>'}
        </div>
        ${renderMediaSummary(flow.mediaNegotiation)}
        <div class="notice-grid">${flow.insights.map(item => `<div class="notice ${item.level}">${escapeHtml(item.text)}</div>`).join('')}</div>
        ${flow.endpoints.length ? `<div><strong>Endpoints</strong><div class="tags">${flow.endpoints.slice(0, 6).map(endpoint => `<span class="tag">${escapeHtml(endpoint)}</span>`).join('')}</div></div>` : ''}
      </article>`;
    }

    function renderMediaSummary(mediaNegotiation) {
        const latest = mediaNegotiation?.latest;
        if (!latest) return '';
        const audio = renderCodecTags('Audio', latest.audio);
        const video = renderCodecTags('Video', latest.video);
        if (!audio && !video) return '';
        return `<div class="media-summary"><strong>Codecs</strong>${audio}${video}</div>`;
    }

    function renderCodecTags(label, media) {
        if (!media || media.status === 'not-present') return '';
        const active = media.negotiated.length ? media.negotiated : media.offered;
        const status = media.negotiated.length ? 'negotiated / used' : 'offered only';
        return `<div class="codec-row"><span>${escapeHtml(label)} <small>${escapeHtml(status)}</small></span><div class="tags">${active.map(codec => `<span class="tag ${media.negotiated.length ? 'ok' : 'warn'}">${escapeHtml(codec.codec)}</span>`).join('')}</div></div>`;
    }

    function renderMediaText(session) {
        const parts = [];
        const audio = codecNames(session.audio?.negotiated || []);
        const video = codecNames(session.video?.negotiated || []);
        const audioOffered = codecNames(session.audio?.offered || []);
        const videoOffered = codecNames(session.video?.offered || []);
        if (audio.length) parts.push(`audio ${audio.join(', ')} negotiated/used`);
        else if (audioOffered.length) parts.push(`audio offered ${audioOffered.join(', ')}`);
        if (video.length) parts.push(`video ${video.join(', ')} negotiated/used`);
        else if (videoOffered.length) parts.push(`video offered ${videoOffered.join(', ')}`);
        return parts.join('; ');
    }

    function codecNames(codecs) {
        return [...new Set((codecs || []).map(codec => codec.codec))];
    }

    function renderMessages() {
        const messages = selectedMessages();
        const rows = messages.map(message => `
      <tr>
        <td class="mono">#${message.index}</td>
        <td>${message.direction === 'received' ? '← Received' : message.direction === 'transmitting' ? 'Transmitting →' : 'Unknown'}</td>
        <td><strong class="${message.status >= 500 ? 'status-bad' : message.status >= 400 ? 'status-warn' : message.status >= 200 ? 'status-ok' : ''}">${escapeHtml(message.status ? `${message.status} ${message.reason}` : message.method)}</strong><br><small class="muted">${escapeHtml(message.startLine)}</small></td>
        <td class="mono">${escapeHtml(shortId(message.callId))}</td>
        <td>${escapeHtml(message.remoteLabel || message.remote)}</td>
        <td>${message.hasAuth ? '<span class="tag warn">Authorization</span>' : ''}${message.hasChallenge ? '<span class="tag warn">Challenge</span>' : ''}${message.hasSdp ? '<span class="tag info">SDP</span>' : ''}${message.sdpMedia?.some(section => section.type === 'audio') ? '<span class="tag info">Audio codecs</span>' : ''}${message.sdpMedia?.some(section => section.type === 'video') ? '<span class="tag info">Video codecs</span>' : ''}</td>
      </tr>`).join('');
        el.output.innerHTML = `<div class="table-wrap"><table><thead><tr><th>#</th><th>Direction</th><th>Message</th><th>Call-ID</th><th>Endpoint</th><th>Flags</th></tr></thead><tbody>${rows || '<tr><td colspan="6">No matching messages.</td></tr>'}</tbody></table></div>`;
    }

    function renderClean() {
        const text = cleanSip(selectedMessages());
        el.output.innerHTML = text ? `<pre class="raw-block">${escapeHtml(text)}</pre>` : '<div class="empty-state"><div><strong>No clean SIP available</strong><span>Select a flow or clear the filter.</span></div></div>';
    }
    // Export only SIP blocks, without syslog/Asterisk wrapper lines.
    function cleanSip(messages) {
        return messages.map(m => m.raw).join('\n\n');
    }

    function countBy(values) {
        return values.filter(Boolean).reduce((acc, value) => {
            acc[value] = (acc[value] || 0) + 1;
            return acc;
        }, {});
    }

    function shortId(value) {
        const text = String(value || '');
        return text.length > 26 ? `${text.slice(0, 12)}...${text.slice(-8)}` : text;
    }

    function escapeHtml(value) {
        return String(value ?? '').replace(/[&<>"]/g, char => ({
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;'
        } [char]));
    }

    function escapeAttr(value) {
        return escapeHtml(value).replace(/'/g, '&#39;');
    }

    function debounce(fn, wait) {
        let timeout;
        return (...args) => {
            clearTimeout(timeout);
            timeout = setTimeout(() => fn(...args), wait);
        };
    }

    function flashButton(button, text) {
        const old = button.textContent;
        button.textContent = text;
        setTimeout(() => {
            button.textContent = old;
        }, 1200);
    }

    function fallbackCopy(text) {
        const area = document.createElement('textarea');
        area.value = text;
        area.style.position = 'fixed';
        area.style.left = '-1000px';
        document.body.appendChild(area);
        area.select();
        document.execCommand('copy');
        document.body.removeChild(area);
    }
    if (typeof window !== 'undefined') {
        window.SipLogAnalyzer = {
            parseSipLog,
            buildFlows,
            cleanSip
        };
    }
    if (typeof module !== 'undefined') {
        module.exports = {
            parseSipLog,
            buildFlows,
            cleanSip,
            sampleLog,
            parseSdpMedia,
            analyzeCodecNegotiation
        };
    }
})();