document.addEventListener("DOMContentLoaded", function () {
    console.log("popup.js: DOMContentLoaded");
    const salaryElement = document.getElementById("salary");
    const timePeriodElement = document.getElementById("time_period");
    const currencyElement = document.getElementById("currency");
    const currentSalaryElement = document.getElementById("current_salary");
    const startButton = document.getElementById("start");
    const stopButton = document.getElementById("stop");
    const resetButton = document.getElementById("reset");

    // Quick sanity checks to make debugging easier
    if (!salaryElement || !timePeriodElement || !currencyElement || !currentSalaryElement || !startButton || !stopButton || !resetButton) {
        console.error("popup.js: missing one or more DOM elements", {
            salaryElement, timePeriodElement, currencyElement, currentSalaryElement, startButton, stopButton, resetButton
        });
    }

    // Show an initial value so the span isn't empty while debugging
    try {
        currentSalaryElement.textContent = "0.00";
    } catch (err) {
        console.warn("popup.js: could not set initial display", err);
    }

    // Rate/animation state
    let animationId = null;
    let accumulated = 0;

    // --- Main logic ---

    function saveState() {
        const isRunning = animationId !== null;
        try {
            const state = {
                salary: parseFloat(salaryElement.value) || 0,
                time_period: timePeriodElement.value,
                currency: currencyElement.value || "E",
                isRunning: isRunning,
                accumulated: accumulated,
                lastUpdate: Date.now(),
            };
            if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.sync) {
                chrome.storage.sync.set(state, () => {
                    console.log("popup.js: state saved to chrome.storage", state);
                });
            } else {
                console.warn("popup.js: chrome.storage.sync not available; saving to localStorage");
                for (const key in state) {
                    localStorage.setItem(key, state[key]);
                }
            }
        } catch (err) {
            console.error("popup.js: error saving state", err);
        }
    }

    function stopCounter() {
        if (animationId !== null) {
            cancelAnimationFrame(animationId);
            animationId = null;
        }
        saveState(); // Save state when explicitly stopped
    }

    function getRatePerMs(amount, period) {
        const msInSecond = 1000;
        const msInMinute = 60 * msInSecond;
        const msInHour = 60 * msInMinute;
        const msInDay = 24 * msInHour;
        const msInWeek = 7 * msInDay;
        const msInMonth = 30 * msInDay; // approximate
        switch (period) {
            case "second": return amount / msInSecond;
            case "minute": return amount / msInMinute;
            case "hour": return amount / msInHour;
            case "day": return amount / msInDay;
            case "week": return amount / msInWeek;
            case "month": return amount / msInMonth;
            default: return 0;
        }
    }

    function formatAmount(value, currency) {
        const fixed = value.toFixed(2);
        if (currency === "E") return `${fixed} €`;
        return `${fixed} ${currency}`;
    }

    function startAnimation(ratePerMs, currency) {
        let lastTimestamp = null;
        function step(ts) {
            if (lastTimestamp === null) lastTimestamp = ts;
            const delta = ts - lastTimestamp;
            accumulated += ratePerMs * delta;
            lastTimestamp = ts;
            currentSalaryElement.textContent = formatAmount(accumulated, currency);
            animationId = requestAnimationFrame(step);
        }
        animationId = requestAnimationFrame(step);
    }

    // Load state and resume if necessary
    try {
        if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.sync) {
            chrome.storage.sync.get(["salary", "time_period", "currency", "isRunning", "accumulated", "lastUpdate"], function (data) {
                console.log("popup.js: storage.get ->", data);
                if (data.salary !== undefined) salaryElement.value = data.salary;
                if (data.time_period) timePeriodElement.value = data.time_period;
                if (data.currency) currencyElement.value = data.currency;

                if (data.isRunning && data.accumulated !== undefined && data.lastUpdate) {
                    const ratePerMs = getRatePerMs(data.salary, data.time_period);
                    const elapsedMs = Date.now() - data.lastUpdate;
                    const newAccumulation = data.accumulated + (ratePerMs * elapsedMs);
                    accumulated = newAccumulation;
                    startAnimation(ratePerMs, data.currency);
                } else {
                    accumulated = data.accumulated || 0;
                    currentSalaryElement.textContent = formatAmount(accumulated, data.currency || "E");
                }
            });
        } else {
            console.warn("popup.js: chrome.storage.sync is not available; falling back to localStorage");
            const savedSalary = localStorage.getItem("salary");
            if (savedSalary !== null) salaryElement.value = savedSalary;
            const tp = localStorage.getItem("time_period");
            if (tp) timePeriodElement.value = tp;
            const cur = localStorage.getItem("currency");
            if (cur) currencyElement.value = cur;

            const isRunning = localStorage.getItem("isRunning") === 'true';
            const storedAccumulated = parseFloat(localStorage.getItem("accumulated"));
            const lastUpdate = parseInt(localStorage.getItem("lastUpdate"), 10);

            if (isRunning && !isNaN(storedAccumulated) && !isNaN(lastUpdate)) {
                const ratePerMs = getRatePerMs(parseFloat(savedSalary), tp);
                const elapsedMs = Date.now() - lastUpdate;
                const newAccumulation = storedAccumulated + (ratePerMs * elapsedMs);
                accumulated = newAccumulation;
                startAnimation(ratePerMs, cur);
            } else {
                accumulated = storedAccumulated || 0;
                currentSalaryElement.textContent = formatAmount(accumulated, cur || "E");
            }
        }
    } catch (err) {
        console.error("popup.js: error reading storage", err);
    }

    // Save state when popup closes
    window.addEventListener("pagehide", saveState);

    startButton.addEventListener("click", function () {
        if (animationId !== null) { // If it's already running, do nothing
            return;
        }
        // read values
        const salary = parseFloat(salaryElement.value) || 0;
        const timePeriod = timePeriodElement.value;
        const currency = currencyElement.value || "E";

        const ratePerMs = getRatePerMs(salary, timePeriod);
        startAnimation(ratePerMs, currency);
        saveState(); // Initial save
    });

    stopButton.addEventListener("click", function () {
        stopCounter();
    });

    resetButton.addEventListener("click", function () {
        stopCounter(); // Stops animation and saves state
        accumulated = 0;
        currentSalaryElement.textContent = formatAmount(0, currencyElement.value || "E");
        saveState(); // Save the reset state
    });
});
