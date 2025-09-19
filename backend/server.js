require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const axios = require('axios');
const multer = require('multer');
const chokidar = require('chokidar');
const fs = require('fs');
const WebSocket = require('ws');

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors({ origin: 'http://localhost:5173' }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

const wss = new WebSocket.Server({ noServer: true });

let usageCount = 0;
let totalBill = 0;
let persistedDocs = [];
let liveFileContent = fs.existsSync(path.join(__dirname, 'external_policy.txt')) ? fs.readFileSync(path.join(__dirname, 'external_policy.txt'), 'utf8') : '';

// Helper function to call the Gemini API
const callGeminiAPI = async (prompt) => {
    try {
        const response = await axios.post(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${process.env.GOOGLE_API_KEY}`,
            {
                contents: [{ parts: [{ text: prompt }] }],
            }
        );
        return response.data.candidates[0].content.parts[0].text;
    } catch (err) {
        console.error('Gemini API Error:', err.response ? err.response.data : err.message);
        throw new Error('Error fetching data from Google Generative AI API.');
    }
};

app.post('/check-docs', upload.array('files'), async (req, res) => {
    try {
        if (!req.files || req.files.length === 0) {
            return res.status(400).json({ error: 'No files uploaded.' });
        }
        const uploadedFileNames = req.files.map(f => f.originalname);
        const fileTexts = [];
        for (const file of req.files) {
            const fileExtension = path.extname(file.originalname).toLowerCase();
            if (fileExtension !== '.txt') {
                return res.status(400).json({ error: `Unsupported file type: ${fileExtension}. Please upload a .txt file.` });
            }
            const content = file.buffer.toString('utf8');
            if (content.trim() === '') {
                return res.status(400).json({ error: `File '${file.originalname}' is empty.` });
            }
            fileTexts.push({ name: file.originalname, text: content });
        }
        persistedDocs = fileTexts;
        const prompt = `
You are a Smart Document Checker.
Compare these documents and find contradictions.
Return a detailed plain-text report including:
- Document names
- Conflicts found
- Explanation
- Suggested clarification
Documents:
${fileTexts.map(f => `${f.name}: ${f.text}`).join('\n')}
`;
        const rawText = await callGeminiAPI(prompt);
        usageCount += 1;
        totalBill += uploadedFileNames.length * 10;
        res.json({
            usageCount,
            totalBill,
            filesAnalyzed: uploadedFileNames,
            report: rawText,
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
});

app.post('/external-update', async (req, res) => {
    try {
        const externalDoc = {
            name: "External Policy Update",
            text: req.body.content
        };
        const allDocs = [...persistedDocs, externalDoc];
        if (allDocs.length < 2) {
            return res.status(400).json({ error: 'Need at least one uploaded document to compare against the update.' });
        }
        const prompt = `
You are a Smart Document Checker.
Find contradictions between the uploaded documents and this external policy update.
Return a detailed plain-text report including:
- Document names
- Conflicts found
- Explanation
- Suggested clarification
Documents:
${allDocs.map(f => `${f.name}: ${f.text}`).join('\n')}
`;
        const rawText = await callGeminiAPI(prompt);
        usageCount += 1;
        totalBill += 10;
        res.json({
            usageCount,
            totalBill,
            filesAnalyzed: allDocs.map(doc => doc.name),
            report: rawText,
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
});

const externalDocPath = path.join(__dirname, 'external_policy.txt');
const watcher = chokidar.watch(externalDocPath, {
    persistent: true,
    ignoreInitial: true 
});

watcher.on('change', async (filePath) => {
    console.log(`Live update detected in ${filePath}!`);
    const oldContent = liveFileContent;
    const newContent = fs.readFileSync(filePath, 'utf8');
    liveFileContent = newContent;

    if (wss.clients.size > 0) {
        wss.clients.forEach(client => {
            if (client.readyState === WebSocket.OPEN) {
                client.send(JSON.stringify({
                    type: 'file-change',
                    oldContent: oldContent,
                    newContent: newContent
                }));
            }
        });
    }

    try {
        const externalDoc = {
            name: "External Policy Update (Live)",
            text: newContent
        };
        const allDocs = [...persistedDocs, externalDoc];
        if (allDocs.length < 2) {
            console.log('Not enough documents to compare. Please upload documents first.');
            return;
        }
        const prompt = `
You are a Smart Document Checker.
Find contradictions between the uploaded documents and this external policy update.
Return a detailed plain-text report including:
- Document names
- Conflicts found
- Explanation
- Suggested clarification
Documents:
${allDocs.map(f => `${f.name}: ${f.text}`).join('\n')}
`;
        const rawText = await callGeminiAPI(prompt);
        const reportData = {
            type: 'report',
            report: rawText,
        };
        if (wss.clients.size > 0) {
            wss.clients.forEach(client => {
                if (client.readyState === WebSocket.OPEN) {
                    client.send(JSON.stringify(reportData));
                }
            });
        }
        console.log('--- Live report generated. ---');
    } catch (err) {
        console.error('File watcher error:', err.message);
    }
});

const server = app.listen(PORT, () => {
    console.log(`Backend running on port ${PORT}`);
});

server.on('upgrade', (request, socket, head) => {
    if (request.url === '/ws') {
        wss.handleUpgrade(request, socket, head, (ws) => {
            wss.emit('connection', ws, request);
        });
    } else {
        socket.destroy();
    }
});