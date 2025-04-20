"use client"

import type React from "react"

import { useEffect, useState, useCallback, useRef } from "react"
import { Loader2, RefreshCw, Info, AlertCircle, Settings } from "lucide-react"

interface SeatStatus {
  version: string
  totalSeats: number
  assignedSeats: number[]
}

export default function SeatDrawingApp() {
  const [status, setStatus] = useState<SeatStatus | null>(null)
  const [seat, setSeat] = useState<number | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [isDrawing, setIsDrawing] = useState(false)
  const [showInitModal, setShowInitModal] = useState(false)
  const [showPasswordModal, setShowPasswordModal] = useState(false)
  const [seatCount, setSeatCount] = useState<number>(0)
  const [password, setPassword] = useState("")
  const [pendingAction, setPendingAction] = useState<"updateVersion" | "initStatus" | null>(null)
  const API_BASE = "https://seat-app-588775665030.asia-east1.run.app/api"
  const modalRef = useRef<HTMLDivElement>(null)
  const passwordModalRef = useRef<HTMLDivElement>(null)
  
  // 設定密碼 - 在實際應用中應該使用加密儲存或後端驗證
  const ADMIN_PASSWORD = "password"

  const getUserId = (): string => {
    let uid = localStorage.getItem("userId")
    if (!uid) {
      uid = generateUUID()
      localStorage.setItem("userId", uid)
    }
    return uid
  }

  const generateUUID = (): string => {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return crypto.randomUUID()
    }

    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0
      const v = c === "x" ? r : (r & 0x3) | 0x8
      return v.toString(16)
    })
  }

  const showError = (msg: string) => {
    setError(msg)
    setTimeout(() => setError(""), 3000)
  }

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/status`)
      if (!res.ok) throw new Error("狀態讀取失敗")
      const st: SeatStatus = await res.json()
      setStatus(st);
      setSeatCount(st.totalSeats);
      return st.version
    } catch (e: any) {
      showError(e.message)
      return null
    }
  }, [API_BASE])

  const initStatus = async (num: number) => {
    try {
      setLoading(true)
      const res = await fetch(`${API_BASE}/init`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ totalSeats: num }),
      })

      if (!res.ok) {
        throw new Error("初始化失敗")
      }

      const payload = await res.json()
      console.log("Init result:", payload)
      await fetchStatus()
      setShowInitModal(false)
    } catch (e: any) {
      showError(e.message)
    } finally {
      setLoading(false)
    }
  }

  const updateVersion = async () => {
    setLoading(true)
    try {
      const res = await fetch(`${API_BASE}/update-version`, {
        method: "POST",
      })
      if (!res.ok) throw new Error("版本更新失敗")
      const data = await res.json()
      if (data.version) {
        setSeat(null)
        await fetchStatus()
      }
    } catch (e: any) {
      showError(e.message)
    }
    setLoading(false)
  }

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

  useEffect(() => {
    ;(async () => {
      setLoading(true)
      const backendVer = await fetchStatus()
      const localVer = localStorage.getItem("seatVersion")
      console.log(`本地版本${localVer}`)
      console.log(`當前版本${backendVer}`)

      if (!localVer && backendVer) {
        localStorage.setItem("seatVersion", backendVer)
      }

      if (backendVer && localVer === backendVer) {
        await checkUserSeat()
      } else {
        localStorage.removeItem("seatNumber")
        setSeat(null)
      }

      setLoading(false)
    })()
  }, [fetchStatus])

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (modalRef.current && !modalRef.current.contains(event.target as Node)) {
        setShowInitModal(false)
      }
      if (passwordModalRef.current && !passwordModalRef.current.contains(event.target as Node)) {
        setShowPasswordModal(false)
        setPendingAction(null)
      }
    }

    document.addEventListener("mousedown", handleClickOutside)
    return () => {
      document.removeEventListener("mousedown", handleClickOutside)
    }
  }, [])

  const drawSeat = async () => {
    if (!status) return

    if (status.assignedSeats.length >= status.totalSeats) {
      showError("所有座位已分配完畢")
      return
    }

    setIsDrawing(true)
    setLoading(true)

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

  // 處理密碼驗證
  const handlePasswordSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    
    if (password === ADMIN_PASSWORD) {
      // 密碼正確，執行待處理的動作
      if (pendingAction === "updateVersion") {
        updateVersion()
      } else if (pendingAction === "initStatus") {
        const numSeats = seatCount
        if (isNaN(numSeats) || numSeats <= 0) {
          showError("請輸入有效的座位數量")
          return
        }
        initStatus(numSeats)
      }
      
      // 清除密碼和關閉模態框
      setPassword("")
      setShowPasswordModal(false)
      setPendingAction(null)
    } else {
      showError("密碼錯誤")
    }
  }

  // 要求輸入密碼以更新版本
  const requestUpdateVersion = () => {
    setPendingAction("updateVersion")
    setShowPasswordModal(true)
  }

  // 處理初始化設定的提交
  const handleInitSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setPendingAction("initStatus")
    setShowPasswordModal(true)
  }

  const seatsPercentage = status ? Math.round((status.assignedSeats.length / status.totalSeats) * 100) : 0

  const isAllSeatsAssigned = status ? status.assignedSeats.length >= status.totalSeats : false
  const hasCurrentSeat = seat !== null
  const isVersionMatch = status?.version === localStorage.getItem("seatVersion")

  return (
    <div className="h-full fixed inset-0 bg-gradient-to-b from-blue-50 to-blue-100 flex flex-col">
      {/* 頂部標題欄 - 更大更明顯 */}
      <div className="bg-blue-500 text-white py-20 px-6 text-center relative shadow-lg">
        <h1 className="text-8xl font-bold">一 班 同 學 會</h1>
        <button
          onClick={() => setShowInitModal(true)}
          className="absolute right-6 top-1/2 -translate-y-1/2 p-4 rounded-full bg-white/20"
          aria-label="初始化設定"
        >
          <Settings className="w-16 h-16 text-white" />
        </button>
      </div>

      {/* 主體內容區 - 增加間距和大小 */}
      <div className="flex-1 flex flex-col px-6 pt-6 pb-8">
        {/* 版本信息區 - 增大文字 */}
        <div className="bg-gradient-to-l from-blue-100 to-blue-50 flex justify-between items-center py-4 shadow">
          <div className="pl-4 text-xl text-blue-800">
            <p className="font-medium">當前版本</p>
            <p>{status?.version || "20230420-204043"}</p>
          </div>
          <button
            onClick={requestUpdateVersion}
            disabled={loading}
            className="flex items-center text-xl text-blue-800 px-5 py-3 rounded-full bg-blue-200"
          >
            <RefreshCw className={`w-7 h-7 mr-2 ${loading ? "animate-spin" : ""}`} />
            更新版本
          </button>
        </div>

        {/* 座位顯示區 - 更大更明顯 */}
        <div className="flex-1 flex justify-center items-center my-10">
          {hasCurrentSeat ? (
            <div className="relative w-96 h-96 bg-white rounded-full flex items-center justify-center shadow-xl">
              <span className="text-[180px] font-bold text-blue-500">{seat}</span>
            </div>
          ) : (
            <div className="w-96 h-96 bg-gray-200 rounded-full flex items-center justify-center">
              <span className="text-[240px] font-bold text-gray-400">?</span>
            </div>
          )}
        </div>
        {/* 抽座位按鈕 - 更大更明顯 */}
        <div className="flex justify-center mb-20">
          <button
            onClick={drawSeat}
            disabled={loading || isDrawing || hasCurrentSeat || isAllSeatsAssigned}
            className={`w-full max-w-xl py-10 rounded-full text-center text-white font-bold text-7xl ${
              loading || isDrawing || hasCurrentSeat || isAllSeatsAssigned
                ? "bg-gray-400"
                : "bg-gradient-to-r from-blue-500 to-cyan-400"
            }`}
          >
            {isDrawing ? (
              <span className="flex items-center justify-center">
                <Loader2 className="animate-spin mr-3 w-8 h-8" /> 抽座位中...
              </span>
            ) : isAllSeatsAssigned ? (
              "所有座位已分配完畢"
            ) : hasCurrentSeat && isVersionMatch ? (
              "已分配座位"
            ) : (
              "抽座位"
            )}
          </button>
        </div>
        {/* 已分配座位進度條 - 增大 */}
        <div className="mt-10">
          <div className="flex justify-between text-2xl mb-3">
            <span>已分配座位</span>
            <span>{status ? `${status.assignedSeats.length} / ${status.totalSeats}` : "3 / 15"}</span>
          </div>
          <div className="h-6 w-full bg-gray-200 rounded-full">
            <div className="h-full bg-blue-500 rounded-full" style={{ width: `${seatsPercentage || 20}%` }} />
          </div>
          <div className="flex justify-between text-xl text-gray-500 mt-3">
          </div>
        </div>

        {/* 錯誤信息顯示 - 增大 */}
        {error && (
          <div className="flex items-start bg-red-50 border border-red-200 text-red-800 p-5 rounded-lg animate-pulse mt-6">
            <AlertCircle className="w-8 h-8 mr-3 flex-shrink-0" />
            <p className="text-xl">{error}</p>
          </div>
        )}
      </div>

      {/* 底部信息欄 - 增大 */}
      <div className="text-xl text-gray-500 flex justify-between items-center p-6 border-t border-gray-200">
        <div className="flex items-center">
          <Info className="w-6 h-6 mr-2" />
          ID: {getUserId()}
        </div>
      </div>

      {/* 初始化設定模态框 - 增大 */}
      {showInitModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div ref={modalRef} className="bg-white rounded-2xl w-full m-20 p-12">
            <h3 className="text-5xl font-bold mb-6">初始化設定</h3>
            <form onSubmit={handleInitSubmit}>
              <div className="mb-6">
                <label htmlFor="seatCount" className="block text-4xl font-medium mb-3">
                  座位數量
                </label>
                <input
                  type="number"
                  id="seatCount"
                  value={seatCount}
                  onChange={(e) => setSeatCount(Number(e.target.value))}
                  className="w-full px-5 py-4 text-4xl border border-gray-300 rounded-2xl"
                  placeholder="請輸入座位數量"
                  min="1"
                  required
                />
              </div>
              <div className="flex justify-end space-x-4">
                <button
                  type="button"
                  onClick={() => setShowInitModal(false)}
                  className="px-12 py-12 text-4xl text-gray-700 bg-gray-100 rounded-2xl"
                >
                  取消
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="px-12 py-12 text-4xl text-white bg-blue-500 rounded-2xl"
                >
                  {loading ? (
                    <span className="flex items-center">
                      <Loader2 className="animate-spin w-6 h-6 mr-2" /> 處理中
                    </span>
                  ) : (
                    "確認"
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 密碼驗證模态框 */}
      {showPasswordModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div ref={passwordModalRef} className="bg-white rounded-2xl w-full m-20 p-12">
            <h3 className="text-5xl font-bold mb-6">
              管理員驗證
            </h3>
            <p className="text-3xl mb-8 text-gray-600">請輸入管理員密碼以繼續操作</p>
            <form onSubmit={handlePasswordSubmit}>
              <div className="mb-6">
                <label htmlFor="password" className="block text-4xl font-medium mb-3">
                  密碼
                </label>
                <input
                  type="password"
                  id="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-5 py-4 text-4xl border border-gray-300 rounded-2xl"
                  placeholder="請輸入管理員密碼"
                  required
                />
              </div>
              <div className="flex justify-end space-x-4">
                <button
                  type="button"
                  onClick={() => {
                    setShowPasswordModal(false)
                    setPendingAction(null)
                    setPassword("")
                  }}
                  className="px-12 py-12 text-4xl text-gray-700 bg-gray-100 rounded-2xl"
                >
                  取消
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="px-12 py-12 text-4xl text-white bg-blue-500 rounded-2xl"
                >
                  {loading ? (
                    <span className="flex items-center">
                      <Loader2 className="animate-spin w-6 h-6 mr-2" /> 處理中
                    </span>
                  ) : (
                    "驗證"
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}