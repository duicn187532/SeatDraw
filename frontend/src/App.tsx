"use client"

import { useEffect, useState, useCallback } from "react"
import { Loader2, RefreshCw, Info, AlertCircle } from "lucide-react"
import confetti from "canvas-confetti"

interface SeatStatus {
  version: string
  totalSeats: number
  assignedSeats: number[]
}

interface SeatRecord {
  userId: string
  seatNumber: number
  version: string
}

export default function SeatDrawingApp() {
  const [status, setStatus] = useState<SeatStatus | null>(null)
  const [seat, setSeat] = useState<number | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [isDrawing, setIsDrawing] = useState(false)
  const [showConfetti, setShowConfetti] = useState(false)
  const API_BASE = "http://192.168.68.101:8080/api";

  const getUserId = (): string => {
    let uid = localStorage.getItem("userId")
    if (!uid) {
      // Fixed function - uses a fallback UUID generator when crypto.randomUUID is not available
      uid = generateUUID()
      localStorage.setItem("userId", uid)
    }
    return uid
  }

  // UUID generator fallback function
  const generateUUID = (): string => {
    // Check if crypto.randomUUID is available
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID()
    }
    
    // Fallback implementation
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      const r = Math.random() * 16 | 0
      const v = c === 'x' ? r : (r & 0x3 | 0x8)
      return v.toString(16)
    })
  }

  const showError = (msg: string) => {
    setError(msg)
    setTimeout(() => setError(""), 3000)
  }

  /** 1. 读取后端状态（version、totalSeats、assignedSeats） */
  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/status`)
      if (!res.ok) throw new Error("狀態讀取失敗")
      const st: SeatStatus = await res.json()
      setStatus(st)
      return st.version
    } catch (e: any) {
      showError(e.message)
      return null
    }
  }, [API_BASE])

  /** 2. 点击「更新版本」按钮时调用：拉最新 version 并存到 localStorage */
  const updateVersion = async () => {
    setLoading(true)
    try {
      const res = await fetch(`${API_BASE}/update-version`, {
        method: "POST",
      })
      if (!res.ok) throw new Error("版本更新失敗")
      const data = await res.json()
      if (data.version) {
        localStorage.setItem("seatVersion", data.version)
        // 版本更新后重新获取状态和座位
        await fetchStatus()
        await checkUserSeat()
      }
    } catch (e: any) {
      showError(e.message)
    }
    setLoading(false)
  }
  
  /** 检查当前用户的座位分配情况 */
  const checkUserSeat = async () => {
    try {
      const uid = getUserId()
      const sRes = await fetch(`${API_BASE}/seat?userId=${uid}`)
      if (sRes.ok) {
        const rec = await sRes.json()
        if (rec.seatNumber != null) {
          setSeat(rec.seatNumber)
          localStorage.setItem("seatNumber", rec.seatNumber.toString())
          return true
        } else {
          setSeat(null)
          localStorage.removeItem("seatNumber")
          return false
        }
      }
    } catch (e: any) {
      showError(e.message)
    }
    return false
  }
  
  /** 3. 每次打开 App 时检查本地版本 vs 后端版本 */
  useEffect(() => {
    ;(async () => {
      setLoading(true)
      const backendVer = await fetchStatus()
      const localVer = localStorage.getItem("seatVersion")
      
      // 若 localVer 不存在，先把后端 version 存下
      if (!localVer && backendVer) {
        localStorage.setItem("seatVersion", backendVer)
      }
      
      // 若两者一致，尝试读取已抽过的座位
      if (backendVer && localVer === backendVer) {
        await checkUserSeat()
      } else {
        // 如果不一致，清除旧结果
        localStorage.removeItem("seatNumber")
        setSeat(null)
      }
      
      setLoading(false)
    })()
  }, [fetchStatus])

  /** 4. 抽座位 */
  const drawSeat = async () => {
    if (!status) return
    
    // 检查是否所有座位都已分配
    if (status.assignedSeats.length >= status.totalSeats) {
      showError("所有座位已分配完畢")
      return
    }
    
    setIsDrawing(true)
    setLoading(true)

    // 简单动画
    const duration = 1500
    const start = Date.now()
    const loop = () => {
      if (Date.now() - start < duration) {
        setSeat(Math.floor(Math.random() * status.totalSeats) + 1)
        requestAnimationFrame(loop)
      } else {
        performActualDraw()
      }
    }
    loop()
  }

  const performActualDraw = async () => {
    try {
      const uid = getUserId()
      const res = await fetch(`${API_BASE}/draw`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: uid }),
      })
      
      if (!res.ok) throw new Error("抽籤請求失敗")
      
      const data = await res.json()
      
      if (data.error) {
        showError(data.error)
        setSeat(null)
        return
      }
      
      if (data.seatNumber != null) {
        setSeat(data.seatNumber)
        localStorage.setItem("seatNumber", data.seatNumber.toString())
        localStorage.setItem("seatVersion", data.version)
        setShowConfetti(true)
        triggerConfetti()
        setTimeout(() => setShowConfetti(false), 3000)
        
        // Refresh status after successful draw
        fetchStatus()
      } else {
        showError("座位分配失敗")
      }
    } catch (e: any) {
      showError(e.message)
    } finally {
      setIsDrawing(false)
      setLoading(false)
    }
  }

  const triggerConfetti = () => {
    const duration = 2000
    const end = Date.now() + duration
    const defaults = { startVelocity: 30, spread: 360, ticks: 60, zIndex: 0 }
    const rand = (min: number, max: number) => Math.random() * (max - min) + min
    const iv = setInterval(() => {
      const tl = end - Date.now()
      if (tl <= 0) return clearInterval(iv)
      const count = 50 * (tl / duration)
      confetti({ ...defaults, particleCount: count, origin: { x: rand(0.1, 0.3), y: Math.random() - 0.2 } })
      confetti({ ...defaults, particleCount: count, origin: { x: rand(0.7, 0.9), y: Math.random() - 0.2 } })
    }, 250)
  }

  const seatsPercentage = status
    ? Math.round((status.assignedSeats.length / status.totalSeats) * 100)
    : 0
    
  const isAllSeatsAssigned = status ? status.assignedSeats.length >= status.totalSeats : false
  const hasCurrentSeat = seat !== null
  const isVersionMatch = status?.version === localStorage.getItem("seatVersion")

  return (
    <div className="min-h-screen bg-slate-50 p-6 flex items-center justify-center">
      <div className="w-full max-w-xl bg-white rounded-lg shadow-lg overflow-hidden">
        {/* Header */}
        <div className="bg-teal-500 text-white p-6 text-center">
          <h1 className="text-3xl font-bold">同學會抽座位</h1>
        </div>

        {/* Body */}
        <div className="p-6 space-y-6">
          {error && (
            <div className="flex items-start bg-red-50 border border-red-200 text-red-800 p-4 rounded-lg">
              <AlertCircle className="w-5 h-5 mr-2 mt-0.5" />
              <div>
                <h3 className="font-medium">錯誤</h3>
                <p className="text-sm">{error}</p>
              </div>
            </div>
          )}

          {/* 显示当前版本 */}
          {status && (
            <div className="flex justify-between items-center">
              <span>當前版本：{status.version}</span>
              <button
                onClick={updateVersion}
                disabled={loading}
                className="flex items-center text-sm text-teal-600 hover:text-teal-800"
              >
                <RefreshCw className="w-4 h-4 mr-1" />
                更新版本
              </button>
            </div>
          )}

          {/* 抽座位区域 */}
          <div className="flex flex-col items-center">
            {hasCurrentSeat && (
              <div className="mb-4 text-center">
                <div className="text-6xl font-bold text-teal-500">{seat}</div>
                <p className="mt-2">你的座位號碼</p>
              </div>
            )}

            <button
              onClick={drawSeat}
              disabled={loading || isDrawing || hasCurrentSeat || isAllSeatsAssigned}
              className={`px-8 py-4 text-lg text-white rounded-full transition ${
                loading || isDrawing || hasCurrentSeat || isAllSeatsAssigned
                  ? "bg-gray-400 cursor-not-allowed"
                  : "bg-gradient-to-r from-teal-500 to-emerald-500 hover:scale-105"
              }`}
            >
              {isDrawing ? (
                <>
                  <Loader2 className="animate-spin mr-2 inline-block" /> 抽座位中...
                </>
              ) : isAllSeatsAssigned ? (
                "所有座位已分配完畢"
              ) : hasCurrentSeat ? (
                "已分配座位"
              ) : (
                "抽座位"
              )}
            </button>
          </div>

          {/* 进度条 */}
          {status && (
            <div className="mt-6 space-y-2">
              <div className="flex justify-between text-sm">
                <span>已分配</span>
                <span>
                  {status.assignedSeats.length} / {status.totalSeats}
                </span>
              </div>
              <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-teal-500 rounded-full transition-all"
                  style={{ width: `${seatsPercentage}%` }}
                />
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-between items-center p-4 bg-slate-50 border-t">
          <div className="flex items-center text-xs text-slate-500">
            <Info className="w-3 h-3 mr-1" />
            ID: {getUserId().slice(0, 8)}…
          </div>
        </div>
      </div>
    </div>
  )
}