import React, { useState, useEffect } from 'react';
import './App.css'; // Import the new CSS file

export default function DocChecker() {
    const [files, setFiles] = useState([]);
    const [loading, setLoading] = useState(false);
    const [report, setReport] = useState(null);
    const [error, setError] = useState(null);
    const [usageCount, setUsageCount] = useState(0);
    const [totalBill, setTotalBill] = useState(0);
    const [liveStatus, setLiveStatus] = useState('');
    const [liveUpdateContent, setLiveUpdateContent] = useState(null);
    const [mockExternalDoc] = useState(`
        College Circular Update (from 2025):
        Minimum attendance required to pass all courses is now 70%.
    `);

    useEffect(() => {
        const ws = new WebSocket('ws://localhost:4000/ws');

        ws.onopen = () => {
            console.log('Connected to WebSocket server');
        };

        ws.onmessage = (event) => {
            const data = JSON.parse(event.data);
            if (data.type === 'status') {
                setLiveStatus(data.message);
                setReport(null);
                setLiveUpdateContent(null);
            } else if (data.type === 'report') {
                setLiveStatus('');
                setReport(data.report);
                setLiveUpdateContent(null);
                setUsageCount(prev => prev + 1);
                setTotalBill(prev => prev + 10);
            } else if (data.type === 'file-change') {
                setLiveStatus('Live file change detected! Displaying changes...');
                setLiveUpdateContent({
                    old: data.oldContent,
                    new: data.newContent
                });
                setReport(null);
            }
        };

        ws.onclose = () => {
            console.log('Disconnected from WebSocket server');
        };

        return () => {
            ws.close();
        };
    }, []);

    function handleFiles(e) {
        setFiles(Array.from(e.target.files).slice(0, 3));
    }

    async function analyzeDocs() {
        if (files.length === 0) return;
        setLoading(true);
        setReport(null);
        setError(null);
        setLiveStatus('');
        setLiveUpdateContent(null);

        const formData = new FormData();
        files.forEach(f => formData.append('files', f));

        try {
            const resp = await fetch('http://localhost:4000/check-docs', {
                method: 'POST',
                body: formData,
            });

            const data = await resp.json();

            if (resp.ok) {
                setReport(data.report);
                setUsageCount(data.usageCount);
                setTotalBill(data.totalBill);
            } else {
                setError(data.error || 'Server error');
            }
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    }

    async function simulateUpdate() {
        if (files.length === 0) {
            setError("Please upload at least one document first to compare against the update.");
            return;
        }

        setLoading(true);
        setReport(null);
        setError(null);
        setLiveStatus('');
        setLiveUpdateContent(null);

        try {
            const resp = await fetch('http://localhost:4000/external-update', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ content: mockExternalDoc }),
            });

            const data = await resp.json();

            if (resp.ok) {
                setReport(data.report);
                setUsageCount(data.usageCount);
                setTotalBill(data.totalBill);
            } else {
                setError(data.error || 'Server error');
            }
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    }

    return (
        <div className="container">
            <h1 className="title">Smart Doc Checker</h1>
            <p className="subtitle">Upload up to 3 documents (.txt) and detect contradictions automatically.</p>
            <div className="controls">
                <div className="control-group file-group">
                    <label className="file-label">
                        Choose Files
                        <input
                            type="file"
                            onChange={handleFiles}
                            multiple
                            accept=".txt"
                            className="file-input-hidden"
                        />
                    </label>
                    {files.length > 0 && (
                        <span className="file-count">{files.length} file(s) selected</span>
                    )}
                </div>
                <div className="control-group button-group">
                    <button
                        onClick={analyzeDocs}
                        disabled={loading || files.length === 0}
                        className="btn primary-btn"
                    >
                        {loading ? 'Analyzing...' : 'Analyze Documents'}
                    </button>
                    <button
                        onClick={simulateUpdate}
                        disabled={loading || files.length === 0}
                        className="btn secondary-btn"
                    >
                        {loading ? 'Checking for Updates...' : 'Simulate External Update'}
                    </button>
                </div>
            </div>
            {liveStatus && (
                <div className="live-status">
                    {liveStatus}
                </div>
            )}
            {error && (
                <div className="error-box">
                    <strong>Error:</strong> {error}
                </div>
            )}

            {liveUpdateContent && (
                <div className="live-update-viewer">
                    <div className="live-update-column old-content">
                        <h3>Before</h3>
                        <pre>{liveUpdateContent.old}</pre>
                    </div>
                    <div className="live-update-column new-content">
                        <h3>Now</h3>
                        <pre>{liveUpdateContent.new}</pre>
                    </div>
                </div>
            )}

            {report && (
                <div className="report-box">
                    <h2 className="report-title">Smart Doc Checker Report</h2>
                    <pre className="report-content">{report}</pre>
                    <div className="report-footer">
                        Usage Count: {usageCount} | Total Bill: ${totalBill}
                    </div>
                </div>
            )}
        </div>
    );
}