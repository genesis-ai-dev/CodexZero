document.addEventListener('DOMContentLoaded', function() {
    const projectId = window.location.pathname.split('/')[2];
    
    // UI Elements
    const jobSelect = document.getElementById('back-translation-job');
    const numLinesInput = document.getElementById('num-lines');
    const exampleCountsInput = document.getElementById('example-counts');
    const runTestBtn = document.getElementById('run-test-btn');
    
    // Results Elements
    const loadingSection = document.getElementById('loading-section');
    const resultsSection = document.getElementById('test-results');

    // Chart instance for cleanup
    let currentChart = null;

    // --- Event Listeners ---
    jobSelect.addEventListener('change', updateButtonState);
    numLinesInput.addEventListener('input', updateButtonState);
    exampleCountsInput.addEventListener('input', updateButtonState);

    runTestBtn.addEventListener('click', runTest);

    function updateButtonState() {
        const hasJob = jobSelect.value;
        const validNumLines = numLinesInput.value && parseInt(numLinesInput.value) >= 1 && parseInt(numLinesInput.value) <= 50;
        const validExampleCounts = validateExampleCounts(exampleCountsInput.value);
        
        // Update visual feedback for example counts
        if (exampleCountsInput.value.trim() && !validExampleCounts) {
            exampleCountsInput.classList.add('border-red-400', 'focus:border-red-500', 'focus:ring-red-500');
            exampleCountsInput.classList.remove('border-neutral-300', 'focus:border-blue-500', 'focus:ring-blue-500');
        } else {
            exampleCountsInput.classList.remove('border-red-400', 'focus:border-red-500', 'focus:ring-red-500');
            exampleCountsInput.classList.add('border-neutral-300', 'focus:border-blue-500', 'focus:ring-blue-500');
        }
        
        runTestBtn.disabled = !(hasJob && validNumLines && validExampleCounts);
    }

    function validateExampleCounts(input) {
        if (!input.trim()) return false;
        
        try {
            const counts = input.split(',').map(s => {
                const trimmed = s.trim();
                if (!trimmed) return null;
                const num = parseInt(trimmed);
                if (isNaN(num) || num < 0 || num > 25) return null;
                return num;
            }).filter(c => c !== null);
            
            // Check if all counts are valid and we have at least one
            const uniqueCounts = [...new Set(counts)];
            return uniqueCounts.length > 0 && uniqueCounts.length <= 10;
        } catch (e) {
            return false;
        }
    }

    // --- Functions ---
    async function runTest() {
        // Show loading state
        loadingSection.classList.remove('hidden');
        resultsSection.classList.add('hidden');
        runTestBtn.disabled = true;

        try {
            const jobId = jobSelect.value;
            const numLines = parseInt(numLinesInput.value);
            const exampleCounts = exampleCountsInput.value.split(',').map(s => parseInt(s.trim()));
            
            const response = await fetch(`/project/${projectId}/test/run`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    job_id: jobId,
                    num_lines: numLines,
                    example_counts: exampleCounts
                })
            });

            const data = await response.json();
            
            if (data.success) {
                renderResults(data);
            } else {
                alert(`Error: ${data.error}`);
            }

        } catch (err) {
            console.error(err);
            alert('An unexpected error occurred.');
        } finally {
            // Hide loading state and re-enable button
            loadingSection.classList.add('hidden');
            runTestBtn.disabled = false;
        }
    }

    function renderResults(data) {
        // Clean up previous chart
        if (currentChart) {
            currentChart.destroy();
            currentChart = null;
        }

        const isMultiLine = data.num_lines_tested > 1;
        
        let summaryHtml = '';
        let tableHtml = '';
        let chartHtml = '';
        
        if (isMultiLine) {
            // Multi-line test results
            summaryHtml = `
                <div class="bg-white border border-neutral-200 rounded-lg p-6">
                    <h3 class="text-xl font-semibold mb-4">Test Summary</h3>
                    <p class="text-sm text-neutral-500 mb-4">Tested ${data.num_lines_tested} random lines with averaging across different example counts.</p>
                </div>
            `;
            
            chartHtml = `
                <div class="bg-white border border-neutral-200 rounded-lg p-6">
                    <h4 class="text-lg font-semibold mb-4">Average Accuracy by Example Count</h4>
                    <div class="relative h-64">
                        <canvas id="accuracy-chart"></canvas>
                    </div>
                </div>
            `;
            
            tableHtml = `
                <div class="bg-white border border-neutral-200 rounded-lg overflow-hidden">
                    <table class="min-w-full divide-y divide-neutral-200">
                        <thead class="bg-neutral-50">
                            <tr>
                                <th scope="col" class="px-6 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider">Examples Used</th>
                                <th scope="col" class="px-6 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider">Average Accuracy</th>
                                <th scope="col" class="px-6 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider">Min / Max</th>
                                <th scope="col" class="px-6 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider">Range</th>
                            </tr>
                        </thead>
                        <tbody class="bg-white divide-y divide-neutral-200">
                            ${data.average_results.map(res => `
                                <tr>
                                    <td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-neutral-900">${res.example_count}</td>
                                    <td class="px-6 py-4 whitespace-nowrap text-sm text-neutral-900">
                                        <div class="flex items-center">
                                            <div class="w-20 bg-neutral-200 rounded-full h-2.5 mr-3">
                                                <div class="bg-blue-600 h-2.5 rounded-full" style="width: ${res.average_accuracy}%"></div>
                                            </div>
                                            <span class="font-semibold">${res.average_accuracy}%</span>
                                        </div>
                                    </td>
                                    <td class="px-6 py-4 whitespace-nowrap text-sm text-neutral-700">${res.min_accuracy}% / ${res.max_accuracy}%</td>
                                    <td class="px-6 py-4 whitespace-nowrap text-sm text-neutral-700">±${Math.round((res.max_accuracy - res.min_accuracy) / 2)}%</td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            `;
            
            // Add line details if available
            if (data.line_details && data.line_details.length > 0) {
                tableHtml += `
                    <div class="bg-white border border-neutral-200 rounded-lg p-6 mt-6">
                        <h4 class="text-lg font-semibold mb-4">Individual Line Details</h4>
                        ${data.line_details.map(line => `
                            <div class="mb-6 pb-4 border-b border-neutral-100 last:border-b-0">
                                <h5 class="font-medium mb-2">Line ${line.line_number}</h5>
                                <div class="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm mb-3">
                                    <div>
                                        <div class="text-neutral-500">Input Text</div>
                                        <div class="font-mono p-2 bg-neutral-50 rounded mt-1">"${line.input_text}"</div>
                                    </div>
                                    <div>
                                        <div class="text-neutral-500">Ground Truth</div>
                                        <div class="font-mono p-2 bg-neutral-50 rounded mt-1">"${line.ground_truth}"</div>
                                    </div>
                                </div>
                                <div class="text-xs text-neutral-500">
                                    Accuracies: ${line.results.map(r => `${r.example_count} examples: ${r.accuracy}%`).join(' | ')}
                                </div>
                            </div>
                        `).join('')}
                    </div>
                `;
            }
        } else {
            // Single line test (backward compatibility)
            summaryHtml = `
                <div class="bg-white border border-neutral-200 rounded-lg p-6">
                    <h3 class="text-xl font-semibold mb-4">Test Summary</h3>
                    <p class="text-sm text-neutral-500 mb-4">A random line was selected for this test.</p>
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                        <div>
                            <div class="text-neutral-500">Input Text (English)</div>
                            <div class="font-mono p-2 bg-neutral-50 rounded mt-1">"${data.input_text}"</div>
                        </div>
                        <div>
                            <div class="text-neutral-500">Ground Truth Translation</div>
                            <div class="font-mono p-2 bg-neutral-50 rounded mt-1">"${data.ground_truth}"</div>
                        </div>
                    </div>
                </div>
            `;
            
            tableHtml = `
                <div class="bg-white border border-neutral-200 rounded-lg overflow-hidden">
                    <table class="min-w-full divide-y divide-neutral-200">
                        <thead class="bg-neutral-50">
                            <tr>
                                <th scope="col" class="px-6 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider">Examples Used</th>
                                <th scope="col" class="px-6 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider">AI Translation Output</th>
                                <th scope="col" class="px-6 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider">Accuracy Score</th>
                            </tr>
                        </thead>
                        <tbody class="bg-white divide-y divide-neutral-200">
                            ${data.results.map(res => `
                                <tr>
                                    <td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-neutral-900">${res.example_count}</td>
                                    <td class="px-6 py-4 whitespace-normal text-sm text-neutral-700 font-mono">"${res.translation}"</td>
                                    <td class="px-6 py-4 whitespace-nowrap text-sm text-neutral-900">
                                        <div class="flex items-center">
                                            <div class="w-20 bg-neutral-200 rounded-full h-2.5 mr-3">
                                                <div class="bg-blue-600 h-2.5 rounded-full" style="width: ${res.accuracy}%"></div>
                                            </div>
                                            <span>${res.accuracy}%</span>
                                        </div>
                                    </td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            `;
        }
        
        resultsSection.innerHTML = summaryHtml + chartHtml + tableHtml;
        resultsSection.classList.remove('hidden');
        
        // Create chart if multi-line
        if (isMultiLine) {
            createChart(data.average_results);
        }
    }

    function createChart(averageResults) {
        const ctx = document.getElementById('accuracy-chart');
        if (!ctx) return;
        
        const labels = averageResults.map(r => `${r.example_count} Examples`);
        const averages = averageResults.map(r => r.average_accuracy);
        const mins = averageResults.map(r => r.min_accuracy);
        const maxes = averageResults.map(r => r.max_accuracy);
        
        currentChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [
                    {
                        label: 'Average Accuracy',
                        data: averages,
                        borderColor: 'rgb(59, 130, 246)',
                        backgroundColor: 'rgba(59, 130, 246, 0.1)',
                        borderWidth: 3,
                        fill: false,
                        tension: 0.1
                    },
                    {
                        label: 'Max Accuracy',
                        data: maxes,
                        borderColor: 'rgba(34, 197, 94, 0.6)',
                        backgroundColor: 'rgba(34, 197, 94, 0.1)',
                        borderWidth: 2,
                        borderDash: [5, 5],
                        fill: false,
                        tension: 0.1
                    },
                    {
                        label: 'Min Accuracy',
                        data: mins,
                        borderColor: 'rgba(239, 68, 68, 0.6)',
                        backgroundColor: 'rgba(239, 68, 68, 0.1)',
                        borderWidth: 2,
                        borderDash: [5, 5],
                        fill: false,
                        tension: 0.1
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'top',
                    },
                    title: {
                        display: false
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        max: 100,
                        title: {
                            display: true,
                            text: 'Accuracy (%)'
                        }
                    },
                    x: {
                        title: {
                            display: true,
                            text: 'Number of Translation Examples'
                        }
                    }
                }
            }
        });
    }
}); 