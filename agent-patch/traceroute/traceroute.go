package traceroute

import (
	"bufio"
	"encoding/json"
	"fmt"
	"os/exec"
	"regexp"
	"runtime"
	"strconv"
	"strings"
)

type HopData struct {
	Index    uint8     `json:"index"`
	IP       string    `json:"ip"`
	Hostname string    `json:"hostname"`
	RTT      []float64 `json:"rtt"`
	Loss     float32   `json:"loss"`
}

type ResultData struct {
	Hops       []HopData `json:"hops"`
	TotalDelay float64   `json:"total_delay"`
}

type taskParams struct {
	Target   string `json:"target"`
	Protocol string `json:"protocol"`
	MaxHops  uint8  `json:"max_hops"`
}

// Execute 执行 traceroute，taskData 是 target 地址（纯字符串或 JSON）
func Execute(taskData string) (string, bool) {
	var params taskParams

	// 尝试 JSON 解析，失败则当作纯 target 地址
	if err := json.Unmarshal([]byte(taskData), &params); err != nil || params.Target == "" {
		params.Target = taskData
	}
	if params.Target == "" {
		return "empty target", false
	}
	if params.MaxHops == 0 {
		params.MaxHops = 30
	}

	output, err := run(params)
	if err != nil {
		return fmt.Sprintf("exec error: %v", err), false
	}

	hops := parseOutput(output, runtime.GOOS)

	var totalDelay float64
	if len(hops) > 0 {
		last := hops[len(hops)-1]
		for _, r := range last.RTT {
			if r > 0 {
				totalDelay = r
				break
			}
		}
	}

	result := ResultData{Hops: hops, TotalDelay: totalDelay}
	data, _ := json.Marshal(result)
	return string(data), true
}

func run(params taskParams) (string, error) {
	var cmd *exec.Cmd
	switch runtime.GOOS {
	case "windows":
		cmd = exec.Command("tracert", "-d", "-h", strconv.Itoa(int(params.MaxHops)), params.Target)
	default:
		if path, err := exec.LookPath("mtr"); err == nil {
			cmd = exec.Command(path, "--no-dns", "-c", "1", "--raw", "-n", params.Target)
		} else if path, err := exec.LookPath("traceroute"); err == nil {
			cmd = exec.Command(path, "-n", "-m", strconv.Itoa(int(params.MaxHops)), params.Target)
		} else {
			return "", fmt.Errorf("no traceroute tool found (tried mtr, traceroute)")
		}
	}
	out, err := cmd.Output()
	if err != nil && len(out) > 0 {
		return string(out), nil
	}
	return string(out), err
}

func parseOutput(output string, goos string) []HopData {
	if goos == "windows" {
		return parseWindows(output)
	}
	if strings.HasPrefix(output, "h ") || strings.Contains(output, "\nh ") {
		return parseMTRRaw(output)
	}
	return parseLinux(output)
}

func parseLinux(output string) []HopData {
	var hops []HopData
	re := regexp.MustCompile(`^\s*(\d+)\s+(.+)$`)
	rttRe := regexp.MustCompile(`([\d.]+)\s*ms`)
	scanner := bufio.NewScanner(strings.NewReader(output))
	for scanner.Scan() {
		line := scanner.Text()
		m := re.FindStringSubmatch(line)
		if m == nil {
			continue
		}
		idx, _ := strconv.Atoi(m[1])
		rest := m[2]
		hop := HopData{Index: uint8(idx)}
		for _, t := range strings.Fields(rest) {
			if t != "*" && !strings.HasSuffix(t, "ms") && isIP(t) {
				hop.IP = t
				break
			}
		}
		if hop.IP == "" {
			hop.IP = "*"
			hop.Loss = 1
		}
		rtts := rttRe.FindAllStringSubmatch(rest, -1)
		for _, r := range rtts {
			v, _ := strconv.ParseFloat(r[1], 64)
			hop.RTT = append(hop.RTT, v)
		}
		if len(hop.RTT) > 0 {
			lost := 0
			for _, r := range hop.RTT {
				if r == 0 {
					lost++
				}
			}
			hop.Loss = float32(lost) / float32(len(hop.RTT))
		}
		hops = append(hops, hop)
	}
	return hops
}

func parseWindows(output string) []HopData {
	var hops []HopData
	rttRe := regexp.MustCompile(`(<?\d+)\s*ms`)
	scanner := bufio.NewScanner(strings.NewReader(output))
	for scanner.Scan() {
		trimmed := strings.TrimSpace(scanner.Text())
		if len(trimmed) == 0 || trimmed[0] < '0' || trimmed[0] > '9' {
			continue
		}
		fields := strings.Fields(trimmed)
		if len(fields) < 2 {
			continue
		}
		idx, err := strconv.Atoi(fields[0])
		if err != nil {
			continue
		}
		hop := HopData{Index: uint8(idx)}
		last := fields[len(fields)-1]
		if isIP(last) {
			hop.IP = last
		} else {
			hop.IP = "*"
			hop.Loss = 1
		}
		rtts := rttRe.FindAllStringSubmatch(trimmed, -1)
		for _, r := range rtts {
			v := strings.TrimPrefix(r[1], "<")
			f, _ := strconv.ParseFloat(v, 64)
			hop.RTT = append(hop.RTT, f)
		}
		timeouts := strings.Count(trimmed, "*")
		total := len(hop.RTT) + timeouts
		if total > 0 {
			hop.Loss = float32(timeouts) / float32(total)
		}
		hops = append(hops, hop)
	}
	return hops
}

func parseMTRRaw(output string) []HopData {
	hopMap := make(map[uint8]*HopData)
	scanner := bufio.NewScanner(strings.NewReader(output))
	for scanner.Scan() {
		fields := strings.Fields(scanner.Text())
		if len(fields) < 3 {
			continue
		}
		switch fields[0] {
		case "h":
			idx, _ := strconv.Atoi(fields[1])
			i := uint8(idx + 1)
			if _, ok := hopMap[i]; !ok {
				hopMap[i] = &HopData{Index: i, IP: fields[2]}
			}
		case "p":
			idx, _ := strconv.Atoi(fields[1])
			rtt, _ := strconv.ParseFloat(fields[2], 64)
			i := uint8(idx + 1)
			if h, ok := hopMap[i]; ok {
				h.RTT = append(h.RTT, rtt/1000)
			}
		}
	}
	var hops []HopData
	for i := uint8(1); i <= uint8(len(hopMap)); i++ {
		if h, ok := hopMap[i]; ok {
			hops = append(hops, *h)
		}
	}
	return hops
}

func isIP(s string) bool {
	parts := strings.Split(s, ".")
	if len(parts) != 4 {
		return false
	}
	for _, p := range parts {
		n, err := strconv.Atoi(p)
		if err != nil || n < 0 || n > 255 {
			return false
		}
	}
	return true
}
