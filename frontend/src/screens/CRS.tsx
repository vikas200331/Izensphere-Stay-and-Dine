import { useEffect, useState } from "react"
import { Link } from "react-router-dom"
import { Search, BedDouble, MapPin, Loader2, Plus, X, Printer, ExternalLink, Camera, ChevronDown, ChevronUp, Check } from "lucide-react"
import { call, newIdempotencyKey, setCurrentProperty } from "../lib/api"
import { toFullPath } from "../lib/routing"
import { Badge } from "../components/ui/badge"
import { serverError } from "../lib/resource"
import { Card, CardContent } from "../components/ui/card"
import { Button } from "../components/ui/button"
import { Sheet } from "../components/ui/sheet"
import { cur, moneyLocale, useLocale } from "../lib/money"
import { useT, t as translate } from "../lib/i18n"
import { useCashierAuth } from "../lib/cashierAuth"
import { shiftDate } from "../lib/stay"


const inr = (n: unknown) =>
  Number(n ?? 0).toLocaleString(moneyLocale(), { maximumFractionDigits: 0 })

const inputCls =
  "w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm " +
  "focus:outline-2 focus:outline-offset-1 focus:outline-brand-600"

export interface RoomItem {
  name: string
  room_number: string
  floor?: string
  housekeeping_status: string
  status: "Available" | "Occupied" | "Maintenance" | "Out of Service"
  is_available: boolean
  conflict_reason?: string | null
  guest_name?: string | null
}

interface RoomTypeAvail {
  room_type: string
  room_type_name: string
  room_type_code?: string
  available: number
  total_rooms?: number
  booked?: number
  maintenance?: number
  out_of_service?: number
  adults_capacity: number
  children_capacity?: number
  image?: string | null
  media?: { url: string; caption?: string | null; media_type?: string }[]
  bed_type?: string | null
  room_view?: string | null
  description?: string | null
  total: number
  per_night: number
  rooms?: RoomItem[]
  free_rooms?: RoomItem[]
}
interface PropAvail {
  property: string
  property_name: string
  city: string
  available_rooms: number
  from_rate: number
  room_types: RoomTypeAvail[]
}
interface Results {
  check_in_date: string
  check_out_date: string
  nights: number
  adults: number
  children: number
  properties: PropAvail[]
}

/** A trip across properties: ordinary reservations (legs) under one ITN
 * reference. Legs are priced and booked by the server, one per property. */
interface TripLeg {
  property: string
  property_name: string
  room_type: string
  room_type_name: string
  check_in_date: string
  check_out_date: string
}
interface QuotedLeg extends TripLeg {
  nights: number
  available: number
  amount_after_tax: number
  currency_symbol: string
  advance_percent: number
  advance_due: number
}
interface ItineraryLeg extends QuotedLeg {
  reservation: string
  city: string | null
  room: string | null
  status: string
  advance_paid: number
  advance_required: number
  deposit_due: number
  cancellation_number: string | null
  cancellation_fee: number
}
export interface Itinerary {
  name: string
  guest_name: string
  phone: string | null
  email: string | null
  status: string
  check_in_date: string | null
  check_out_date: string | null
  created: string
  legs: ItineraryLeg[]
  total: number | null
  advance_paid: number | null
  advance_required: number | null
  advance_due: number | null
  advance_held_cancelled: number | null
}
interface AdvancePlan {
  amount: number
  currency_symbol: string
  advance_due: number
  unpaid: number
  legs: { reservation: string; property_name: string; check_in_date: string;
    advance_percent: number; advance_due: number; share: number }[]
}
interface TripRow {
  name: string
  guest_name: string
  status: string
  legs: { reservation: string; property: string; check_in_date: string; check_out_date: string; status: string }[]
}
interface CancelPreview {
  legs: { reservation: string; property: string; estimated_fee: number; fee_basis: string; currency_symbol: string }[]
  not_cancellable: { reservation: string; status: string }[]
  total_fee: number | null
}

const STATUS_TONE: Record<string, "green" | "sky" | "zinc" | "rose"> = {
  Booked: "green", "In stay": "sky", Completed: "zinc", Cancelled: "rose",
  Confirmed: "green", "Checked In": "sky", "Checked Out": "zinc",
}

// spelled out so the catalog extractor sees each label
const statusLabel = (s: string) => ({
  Booked: translate("Booked"), "In stay": translate("In stay"),
  Completed: translate("Completed"), Cancelled: translate("Cancelled"),
}[s] ?? translate(s))

/** Open a leg in Reservations at its own property (deposit, dates, cancel). */
function openLeg(property: string, reservation: string) {
  setCurrentProperty(property)
  window.location.assign(toFullPath(`/reservations?q=${encodeURIComponent(reservation)}`))
}

function isoToday() {
  return new Date().toISOString().slice(0, 10)
}

export default function CRS() {
  const { t, tn } = useT()
  const [checkIn, setCheckIn] = useState(isoToday())
  const [nights, setNights] = useState(1)
  const [adults, setAdults] = useState(2)
  const [children, setChildren] = useState(0)
  const [data, setData] = useState<Results | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [booking, setBooking] = useState<{
    property: string
    property_name: string
    rt: RoomTypeAvail
  } | null>(null)
  const [selectedRoom, setSelectedRoom] = useState<string>("")
  const [expandedRt, setExpandedRt] = useState<Record<string, boolean>>({})
  const [previewPhoto, setPreviewPhoto] = useState<{ url: string; caption?: string | null } | null>(null)
  const [bookingPhotoIdx, setBookingPhotoIdx] = useState(0)
  const [guest, setGuest] = useState({ name: "", phone: "" })
  const [done, setDone] = useState<string | null>(null)
  const [trip, setTrip] = useState<TripLeg[]>([])
  const [tripQuote, setTripQuote] = useState<{ legs: QuotedLeg[]; total: number | null; advance_due: number | null } | null>(null)
  const [traveller, setTraveller] = useState({ name: "", phone: "" })
  const [trips, setTrips] = useState<TripRow[]>([])
  const [tripSearch, setTripSearch] = useState("")
  const [openTrip, setOpenTrip] = useState<string | null>(null)

  const checkOut = shiftDate(checkIn, Math.max(1, nights))

  const loadTrips = () =>
    call<TripRow[]>("kamra.crs.list_itineraries", { search: tripSearch || null })
      .then(setTrips)
      .catch(() => setTrips([]))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    loadTrips()
    search()
  }, [])

  // the server prices the whole trip each time a stop changes
  useEffect(() => {
    if (!trip.length) { setTripQuote(null); return }
    call<{ legs: QuotedLeg[]; total: number | null; advance_due: number | null }>("kamra.crs.quote_itinerary", {
      legs: trip, adults, children,
    }).then(setTripQuote).catch((e) => { setTripQuote(null); setError(serverError(e)) })
  }, [trip, adults, children])

  function addToTrip(p: PropAvail, rt: RoomTypeAvail) {
    setError(null)
    setTrip([...trip, {
      property: p.property, property_name: p.property_name,
      room_type: rt.room_type, room_type_name: rt.room_type_name,
      check_in_date: checkIn, check_out_date: checkOut,
    }])
    // the next stop starts the day this one ends
    setCheckIn(checkOut)
    setData(null)
  }

  async function bookTrip() {
    setBusy(true)
    setError(null)
    try {
      const r = await call<Itinerary>("kamra.crs.create_itinerary", {
        legs: trip, guest_name: traveller.name, phone: traveller.phone || null,
        adults, children,
      })
      setDone(t("Trip {ref} booked: {n} stays.", { ref: r.name, n: r.legs.length }))
      setTrip([])
      setTraveller({ name: "", phone: "" })
      setOpenTrip(r.name)
      loadTrips()
    } catch (e) {
      setError(serverError(e))
    } finally {
      setBusy(false)
    }
  }

  async function search() {
    setBusy(true)
    setError(null)
    try {
      const r = await call<Results>("kamra.crs.crs_search", {
        check_in_date: checkIn,
        check_out_date: checkOut,
        adults,
        children,
      })
      setData(r)
    } catch (e) {
      setError(serverError(e))
    } finally {
      setBusy(false)
    }
  }

  async function book() {
    if (!booking) return
    setBusy(true)
    setError(null)
    try {
      const r = await call<{ reservation: string }>("kamra.api.create_booking", {
        property: booking.property,
        room_type: booking.rt.room_type,
        check_in_date: checkIn,
        check_out_date: checkOut,
        guest_name: guest.name,
        phone: guest.phone || null,
        adults,
        children,
        room: selectedRoom || undefined,
        assign_room: 1,
        source: "Manual",
      })
      setDone(t("Booked {ref} at {property}.", { ref: r.reservation, property: booking.property_name }))
      setBooking(null)
      search()
    } catch (e) {
      setError(serverError(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold text-zinc-800">{t("Central reservations")}</h1>
        <p className="text-xs text-zinc-500">
          {t("Find a room across every property you manage, and book into whichever has space.")}
        </p>
      </div>

      <Card>
        <CardContent className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-5">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-zinc-500">{t("Check-in")}</span>
            <input type="date" className={inputCls} value={checkIn}
              onChange={(e) => setCheckIn(e.target.value)} />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-zinc-500">{t("Nights")}</span>
            <input type="number" min={1} className={inputCls} value={nights}
              onChange={(e) => setNights(Math.max(1, Number(e.target.value)))} />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-zinc-500">{t("Adults")}</span>
            <input type="number" min={1} className={inputCls} value={adults}
              onChange={(e) => setAdults(Math.max(1, Number(e.target.value)))} />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-zinc-500">{t("Children")}</span>
            <input type="number" min={0} className={inputCls} value={children}
              onChange={(e) => setChildren(Math.max(0, Number(e.target.value)))} />
          </label>
          <div className="flex items-end">
            <Button className="w-full" disabled={busy || !checkOut} onClick={search}>
              {busy ? <Loader2 className="size-4 animate-spin" /> : <Search className="size-4" />}
              {t("Search")}
            </Button>
          </div>
        </CardContent>
      </Card>

      {error && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {translate(error)}
        </div>
      )}
      {done && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          {done}
        </div>
      )}

      {trip.length > 0 && (
        <Card className="border-brand-200">
          <CardContent className="space-y-3 p-4">
            <div className="flex items-baseline justify-between">
              <h2 className="text-sm font-semibold text-zinc-800">{t("New trip")}</h2>
              <span className="text-xs text-zinc-500">{t("Search the next stop, then add it.")}</span>
            </div>
            <ol className="space-y-1.5">
              {trip.map((leg, i) => {
                const q = tripQuote?.legs.find((x) =>
                  x.property === leg.property && x.check_in_date === leg.check_in_date)
                return (
                  <li key={i} className="flex flex-wrap items-center gap-2 rounded-lg bg-zinc-50 px-3 py-2 text-sm">
                    <span className="flex size-5 items-center justify-center rounded-full bg-brand-600 text-[11px] font-semibold text-white">{i + 1}</span>
                    <span className="font-medium">{leg.property_name}</span>
                    <span className="text-zinc-500">{leg.room_type_name} · {leg.check_in_date} → {leg.check_out_date}</span>
                    {q && q.available < 1 && <Badge tone="rose">{t("No room free")}</Badge>}
                    <span className="ml-auto font-medium">{q ? `${q.currency_symbol}${inr(q.amount_after_tax)}` : "…"}</span>
                    <Button variant="ghost" aria-label={t("Remove stay")}
                      onClick={() => setTrip(trip.filter((_, j) => j !== i))}>
                      <X className="size-4" />
                    </Button>
                  </li>
                )
              })}
            </ol>
            <div className="flex justify-between border-t border-zinc-100 pt-2 text-sm font-semibold">
              <span>{t("Trip total, taxes in")}</span>
              <span>
                {tripQuote?.total != null
                  ? `${tripQuote.legs[0]?.currency_symbol ?? ""}${inr(tripQuote.total)}`
                  : tripQuote ? t("Each stay is billed in its own currency") : "…"}
              </span>
            </div>
            {(tripQuote?.advance_due ?? 0) > 0 && (
              <div className="flex justify-between text-sm text-zinc-600">
                <span>{t("Advance due at booking ({pcts})", {
                  pcts: tripQuote!.legs.map((l) => `${l.advance_percent}%`).join(", ") })}</span>
                <span>{`${tripQuote!.legs[0]?.currency_symbol ?? ""}${inr(tripQuote!.advance_due)}`}</span>
              </div>
            )}
            <div className="grid gap-3 sm:grid-cols-3">
              <input className={inputCls} placeholder={t("Guest name")} value={traveller.name}
                onChange={(e) => setTraveller({ ...traveller, name: e.target.value })} />
              <input className={inputCls} placeholder={t("Phone")} value={traveller.phone}
                onChange={(e) => setTraveller({ ...traveller, phone: e.target.value })} />
              <Button disabled={busy || !traveller.name.trim() || !tripQuote} onClick={bookTrip}>
                {t("Book trip")}
              </Button>
            </div>
            <p className="text-xs text-zinc-500">
              {t("Each stay becomes a normal booking at its own property, with its own bill. Take one advance for the trip from its sheet, or on each stay.")}
            </p>
          </CardContent>
        </Card>
      )}

      {data && (
        <div className="space-y-3">
          <p className="text-sm text-zinc-500">
            {tn(data.properties.length, "{n} property with space", "{n} properties with space")} ·{" "}
            {tn(data.nights, "{n} night", "{n} nights")}, {tn(data.adults, "{n} adult", "{n} adults")}
            {data.children ? `, ${tn(data.children, "{n} child", "{n} children")}` : ""}
          </p>
          {data.properties.length === 0 && (
            <Card><CardContent className="p-8 text-center text-sm text-zinc-400">
              {t("No rooms across the chain for these dates and party.")}
            </CardContent></Card>
          )}
          {data.properties.map((p) => (
            <Card key={p.property}>
              <CardContent className="p-4">
                <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2 border-b border-zinc-100 pb-2">
                  <div>
                    <span className="text-base font-semibold text-zinc-800">{p.property_name}</span>
                    <span className="ml-2 inline-flex items-center gap-1 text-xs text-zinc-400">
                      <MapPin className="size-3" />{p.city}
                    </span>
                  </div>
                  <span className="text-xs font-medium text-zinc-600">
                    {t("{n} rooms · from {rate}/night", {
                      n: p.available_rooms,
                      rate: `${cur()}${inr(p.from_rate)}`,
                    })}
                  </span>
                </div>
                <div className="divide-y divide-zinc-100">
                  {p.room_types.map((rt) => {
                    const isExpanded = !!expandedRt[rt.room_type]
                    const roomPhotos = rt.media && rt.media.length > 0
                      ? rt.media.filter((m) => m.media_type === "Image" || !m.media_type).map((m) => ({ url: m.url, caption: m.caption }))
                      : rt.image ? [{ url: rt.image, caption: rt.room_type_name }] : []
                    const mainPhoto = roomPhotos[0]?.url || rt.image || null
                    const totalRoomsCount = rt.total_rooms ?? (rt.rooms?.length || 0)

                    return (
                      <div key={rt.room_type} className="py-3.5 space-y-2">
                        <div className="flex flex-col sm:flex-row sm:items-start gap-3">
                          {/* Room Picture / Thumbnail */}
                          {mainPhoto ? (
                            <button
                              type="button"
                              onClick={() => setPreviewPhoto({ url: mainPhoto, caption: `${p.property_name} · ${rt.room_type_name}` })}
                              className="group relative h-22 w-32 shrink-0 overflow-hidden rounded-lg border border-zinc-200 bg-zinc-100 text-left cursor-pointer transition hover:opacity-95"
                              title={t("Click to view photo")}
                            >
                              <img
                                src={mainPhoto}
                                alt={rt.room_type_name}
                                className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                              />
                              {roomPhotos.length > 1 && (
                                <span className="absolute bottom-1 right-1 flex items-center gap-0.5 rounded bg-black/60 px-1 py-0.5 text-[10px] font-medium text-white shadow-xs">
                                  <Camera className="size-2.5" />
                                  {roomPhotos.length}
                                </span>
                              )}
                            </button>
                          ) : (
                            <div className="flex h-22 w-32 shrink-0 items-center justify-center rounded-lg border border-zinc-200 bg-zinc-50 text-zinc-400">
                              <BedDouble className="size-8 stroke-[1.5]" />
                            </div>
                          )}

                          {/* Room Details & Availability Summary */}
                          <div className="min-w-0 flex-1 space-y-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="text-base font-semibold text-zinc-800">{rt.room_type_name}</span>
                              {rt.room_type_code && (
                                <span className="rounded bg-zinc-100 px-1.5 py-0.5 text-[11px] font-mono font-medium text-zinc-600">
                                  {rt.room_type_code}
                                </span>
                              )}
                              {rt.available > 0 ? (
                                <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                                  rt.available <= 2 ? "bg-amber-100 text-amber-800" : "bg-emerald-100 text-emerald-800"
                                }`}>
                                  <span className={`size-1.5 rounded-full ${rt.available <= 2 ? "bg-amber-500" : "bg-emerald-500"}`} />
                                  {rt.available <= 2
                                    ? t("{n} left!", { n: rt.available })
                                    : t("{n} available", { n: rt.available })}
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 rounded-full bg-rose-100 px-2 py-0.5 text-xs font-semibold text-rose-800">
                                  <span className="size-1.5 rounded-full bg-rose-500" />
                                  {t("Sold out")}
                                </span>
                              )}
                            </div>

                            {/* Room Specs & Features */}
                            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-zinc-500">
                              <span>
                                {t("Sleeps {cap}", { cap: rt.adults_capacity })}
                                {rt.children_capacity ? ` + ${rt.children_capacity} ${t("ch")}` : ""}
                              </span>
                              {rt.bed_type && (
                                <span className="inline-flex items-center gap-1">
                                  · <span className="font-medium text-zinc-700">{rt.bed_type} Bed</span>
                                </span>
                              )}
                              {rt.room_view && (
                                <span className="inline-flex items-center gap-1">
                                  · <span className="font-medium text-zinc-700">{rt.room_view} View</span>
                                </span>
                              )}
                              <span className="text-zinc-400">
                                · {t("{total} total rooms", { total: totalRoomsCount })}
                              </span>
                            </div>

                            {/* Availability Counts Breakdown Strip */}
                            <div className="flex flex-wrap items-center gap-2 pt-0.5 text-[11px]">
                              <span className="inline-flex items-center gap-1 rounded bg-zinc-100 px-1.5 py-0.5 text-zinc-600">
                                {t("Total:")} <strong className="text-zinc-800">{totalRoomsCount}</strong>
                              </span>
                              <span className="inline-flex items-center gap-1 rounded bg-emerald-50 px-1.5 py-0.5 text-emerald-800 border border-emerald-200">
                                <span className="size-1.5 rounded-full bg-emerald-500" />
                                {t("Available:")} <strong>{rt.available}</strong>
                              </span>
                              {(rt.booked || 0) > 0 && (
                                <span className="inline-flex items-center gap-1 rounded bg-rose-50 px-1.5 py-0.5 text-rose-800 border border-rose-200">
                                  <span className="size-1.5 rounded-full bg-rose-500" />
                                  {t("Booked:")} <strong>{rt.booked}</strong>
                                </span>
                              )}
                              {(rt.maintenance || 0) > 0 && (
                                <span className="inline-flex items-center gap-1 rounded bg-amber-50 px-1.5 py-0.5 text-amber-800 border border-amber-200">
                                  <span className="size-1.5 rounded-full bg-amber-500" />
                                  {t("Maintenance:")} <strong>{rt.maintenance}</strong>
                                </span>
                              )}
                              {(rt.out_of_service || 0) > 0 && (
                                <span className="inline-flex items-center gap-1 rounded bg-zinc-100 px-1.5 py-0.5 text-zinc-700 border border-zinc-200">
                                  <span className="size-1.5 rounded-full bg-zinc-400" />
                                  {t("OOS:")} <strong>{rt.out_of_service}</strong>
                                </span>
                              )}
                            </div>

                            {/* Available Rooms List */}
                            {rt.free_rooms && rt.free_rooms.length > 0 && (
                              <div className="flex flex-wrap items-center gap-1.5 pt-1">
                                <span className="text-xs font-medium text-zinc-500">{t("Free rooms:")}</span>
                                {rt.free_rooms.map((rm) => (
                                  <span
                                    key={rm.name}
                                    className="inline-flex items-center gap-1 rounded border border-emerald-200 bg-emerald-50/80 px-1.5 py-0.5 text-[11px] font-medium text-emerald-800"
                                  >
                                    <span className="size-1.5 rounded-full bg-emerald-500" />
                                    {rm.room_number}
                                    {rm.housekeeping_status && (
                                      <span className="text-[10px] text-emerald-600">({rm.housekeeping_status})</span>
                                    )}
                                  </span>
                                ))}
                              </div>
                            )}

                            {/* Toggle Room Status Board */}
                            {rt.rooms && rt.rooms.length > 0 && (
                              <div className="pt-1">
                                <button
                                  type="button"
                                  onClick={() =>
                                    setExpandedRt((prev) => ({ ...prev, [rt.room_type]: !prev[rt.room_type] }))
                                  }
                                  className="inline-flex items-center gap-1 text-xs font-semibold text-brand-700 hover:text-brand-800"
                                >
                                  {isExpanded ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" />}
                                  {isExpanded
                                    ? t("Hide room availability board")
                                    : t("Show all room availability ({n} rooms)", { n: rt.rooms.length })}
                                </button>
                              </div>
                            )}
                          </div>

                          {/* Price & Actions */}
                          <div className="flex sm:flex-col items-center sm:items-end justify-between sm:justify-center gap-3 shrink-0 pt-2 sm:pt-0">
                            <div className="text-left sm:text-right">
                              <div className="text-base font-bold text-zinc-900">{cur()}{inr(rt.total)}</div>
                              <div className="text-[11px] text-zinc-500">
                                {cur()}{inr(rt.per_night)}/{t("night")} · {t("taxes in")}
                              </div>
                            </div>
                            <div className="flex items-center gap-1.5">
                              <Button
                                disabled={rt.available <= 0}
                                onClick={() => {
                                  setSelectedRoom(rt.free_rooms?.[0]?.name ?? "")
                                  setBookingPhotoIdx(0)
                                  setBooking({ property: p.property, property_name: p.property_name, rt })
                                  setGuest({ name: "", phone: "" })
                                }}
                              >
                                {t("Book")}
                              </Button>
                              <Button
                                variant="outline"
                                title={t("Add this stay to a trip across properties")}
                                onClick={() => addToTrip(p, rt)}
                              >
                                <Plus className="size-4" />
                                {t("Add to trip")}
                              </Button>
                            </div>
                          </div>
                        </div>

                        {/* Collapsible Room Status Board */}
                        {isExpanded && rt.rooms && (
                          <div className="mt-2.5 rounded-xl border border-zinc-200 bg-zinc-50/80 p-3.5 space-y-3">
                            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-200 pb-2">
                              <span className="text-xs font-bold uppercase tracking-wider text-zinc-700">
                                {t("{type} Room Availability Status ({checkIn} → {checkOut})", {
                                  type: rt.room_type_name,
                                  checkIn,
                                  checkOut,
                                })}
                              </span>
                              <div className="flex flex-wrap items-center gap-3 text-xs">
                                <span className="flex items-center gap-1">
                                  <span className="size-2 rounded-full bg-emerald-500" />
                                  <span className="text-zinc-600">{t("Available")} ({rt.available})</span>
                                </span>
                                <span className="flex items-center gap-1">
                                  <span className="size-2 rounded-full bg-rose-500" />
                                  <span className="text-zinc-600">{t("Occupied / Booked")} ({rt.booked || 0})</span>
                                </span>
                                <span className="flex items-center gap-1">
                                  <span className="size-2 rounded-full bg-amber-500" />
                                  <span className="text-zinc-600">{t("Maintenance")} ({rt.maintenance || 0})</span>
                                </span>
                                {(rt.out_of_service || 0) > 0 && (
                                  <span className="flex items-center gap-1">
                                    <span className="size-2 rounded-full bg-zinc-400" />
                                    <span className="text-zinc-600">{t("Out of Service")} ({rt.out_of_service})</span>
                                  </span>
                                )}
                              </div>
                            </div>

                            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2.5">
                              {rt.rooms.map((rm) => {
                                const isAvail = rm.is_available
                                const isOcc = rm.status === "Occupied"
                                const isMaint = rm.status === "Maintenance"

                                return (
                                  <div
                                    key={rm.name}
                                    className={`rounded-lg border p-2 text-xs transition ${
                                      isAvail
                                        ? "border-emerald-300 bg-emerald-50/50 text-emerald-950"
                                        : isOcc
                                        ? "border-rose-200 bg-rose-50/40 text-rose-950"
                                        : isMaint
                                        ? "border-amber-200 bg-amber-50/40 text-amber-950"
                                        : "border-zinc-200 bg-zinc-100 text-zinc-700"
                                    }`}
                                  >
                                    <div className="flex items-center justify-between">
                                      <span className="font-bold">{t("Room {no}", { no: rm.room_number })}</span>
                                      <span
                                        className={`size-2.5 rounded-full ${
                                          isAvail
                                            ? "bg-emerald-500"
                                            : isOcc
                                            ? "bg-rose-500"
                                            : isMaint
                                            ? "bg-amber-500"
                                            : "bg-zinc-400"
                                        }`}
                                      />
                                    </div>
                                    <div className="mt-1 flex items-center justify-between text-[11px] text-zinc-500">
                                      <span>{rm.floor ? t("Fl. {f}", { f: rm.floor }) : ""}</span>
                                      <span
                                        className={`font-semibold ${
                                          isAvail
                                            ? "text-emerald-700"
                                            : isOcc
                                            ? "text-rose-700"
                                            : isMaint
                                            ? "text-amber-700"
                                            : "text-zinc-600"
                                        }`}
                                      >
                                        {rm.status}
                                      </span>
                                    </div>
                                    {rm.housekeeping_status && (
                                      <div className="text-[10px] text-zinc-400">
                                        {t("HK:")} {rm.housekeeping_status}
                                      </div>
                                    )}
                                    {rm.conflict_reason && (
                                      <div
                                        className="mt-1 truncate text-[10px] text-rose-600"
                                        title={rm.conflict_reason}
                                      >
                                        {rm.conflict_reason}
                                      </div>
                                    )}
                                  </div>
                                )
                              })}
                            </div>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Card>
        <CardContent className="space-y-3 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-zinc-800">{t("Trips")}</h2>
            <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); loadTrips() }}>
              <input className={inputCls} placeholder={t("Guest or ITN reference")} value={tripSearch}
                onChange={(e) => setTripSearch(e.target.value)} />
              <Button variant="outline" type="submit" aria-label={t("Search")}><Search className="size-4" /></Button>
            </form>
          </div>
          {trips.length === 0 && (
            <p className="py-4 text-center text-sm text-zinc-400">{t("No trips yet. Add stays from the search above.")}</p>
          )}
          <div className="divide-y divide-zinc-100">
            {trips.map((r) => (
              <button key={r.name} onClick={() => setOpenTrip(r.name)}
                className="flex w-full flex-wrap items-center gap-2 py-2.5 text-left text-sm hover:bg-zinc-50">
                <span className="font-mono text-xs text-zinc-500">{r.name}</span>
                <span className="font-medium text-zinc-800">{r.guest_name}</span>
                <span className="text-xs text-zinc-500">
                  {r.legs.map((l) => l.property).join(" → ")}
                  {r.legs.length > 0 && ` · ${r.legs[0].check_in_date} → ${r.legs[r.legs.length - 1].check_out_date}`}
                </span>
                <Badge className="ml-auto" tone={STATUS_TONE[r.status] ?? "zinc"}>{statusLabel(r.status)}</Badge>
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {openTrip && (
        <TripSheet name={openTrip} onClose={() => setOpenTrip(null)} onChanged={loadTrips} />
      )}

      {booking && (
        <Sheet
          title={t("Book {type}", { type: booking.rt.room_type_name })}
          description={`${booking.property_name} · ${checkIn} → ${checkOut} (${nights} ${nights === 1 ? t("night") : t("nights")})`}
          onClose={() => setBooking(null)}
          footer={
            <div className="flex justify-between items-center w-full">
              <div className="text-left">
                <div className="text-xs text-zinc-500">{t("Total Quote")}</div>
                <div className="text-base font-bold text-zinc-900">{cur()}{inr(booking.rt.total)}</div>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setBooking(null)}>{t("Cancel")}</Button>
                <Button
                  disabled={busy || !guest.name.trim()}
                  onClick={() => book()}
                >
                  {busy ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
                  {t("Confirm Booking")}
                </Button>
              </div>
            </div>
          }
        >
          <div className="space-y-4">
            {/* Room Photo Gallery */}
            {(() => {
              const photos = booking.rt.media && booking.rt.media.length > 0
                ? booking.rt.media.filter((m) => m.media_type === "Image" || !m.media_type).map((m) => ({ url: m.url, caption: m.caption }))
                : booking.rt.image ? [{ url: booking.rt.image, caption: booking.rt.room_type_name }] : []
              const active = photos[bookingPhotoIdx] || photos[0] || null

              if (!active) return null

              return (
                <div className="space-y-2">
                  <div
                    className="group relative h-48 w-full overflow-hidden rounded-xl border border-zinc-200 bg-zinc-100 cursor-pointer shadow-xs"
                    onClick={() => setPreviewPhoto({ url: active.url, caption: active.caption || `${booking.property_name} · ${booking.rt.room_type_name}` })}
                  >
                    <img
                      src={active.url}
                      alt={active.caption || booking.rt.room_type_name}
                      className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
                    <div className="absolute bottom-2.5 left-3 right-3 flex items-end justify-between text-white">
                      <div>
                        <div className="text-sm font-semibold drop-shadow">{booking.rt.room_type_name}</div>
                        {active.caption && (
                          <div className="text-xs text-zinc-200 drop-shadow">{active.caption}</div>
                        )}
                      </div>
                      <span className="rounded bg-black/60 px-2 py-0.5 text-xs font-medium text-white backdrop-blur-xs flex items-center gap-1">
                        <Camera className="size-3" />
                        {bookingPhotoIdx + 1}/{photos.length}
                      </span>
                    </div>
                  </div>

                  {photos.length > 1 && (
                    <div className="flex gap-2 overflow-x-auto pb-1">
                      {photos.map((p, idx) => (
                        <button
                          key={p.url + idx}
                          type="button"
                          onClick={() => setBookingPhotoIdx(idx)}
                          className={`relative h-14 w-20 shrink-0 overflow-hidden rounded-md border-2 transition ${
                            idx === bookingPhotoIdx
                              ? "border-brand-600 shadow-xs"
                              : "border-transparent opacity-70 hover:opacity-100"
                          }`}
                        >
                          <img src={p.url} alt="" className="h-full w-full object-cover" />
                        </button>
                      ))}
                    </div>
                  )}

                  {/* Room Features Badges */}
                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    {booking.rt.bed_type && (
                      <span className="rounded-md bg-zinc-100 px-2 py-1 text-xs font-medium text-zinc-700">
                        {booking.rt.bed_type} Bed
                      </span>
                    )}
                    {booking.rt.room_view && (
                      <span className="rounded-md bg-zinc-100 px-2 py-1 text-xs font-medium text-zinc-700">
                        {booking.rt.room_view} View
                      </span>
                    )}
                    <span className="rounded-md bg-zinc-100 px-2 py-1 text-xs font-medium text-zinc-700">
                      {t("Capacity: Up to {n} Adults", { n: booking.rt.adults_capacity })}
                    </span>
                  </div>
                </div>
              )
            })()}

            {/* Room Availability Summary Cards */}
            <div className="rounded-xl border border-zinc-200 bg-white p-3 shadow-xs space-y-2">
              <div className="flex items-center justify-between border-b border-zinc-100 pb-2">
                <span className="text-xs font-bold uppercase tracking-wider text-zinc-800">
                  {t("Room Availability Summary")}
                </span>
                <span className="text-xs text-zinc-500">
                  {checkIn} → {checkOut}
                </span>
              </div>
              <div className="grid grid-cols-4 gap-2 text-center">
                <div className="rounded-lg bg-zinc-50 p-2 border border-zinc-100">
                  <div className="text-[11px] text-zinc-500">{t("Total")}</div>
                  <div className="text-sm font-bold text-zinc-800">
                    {booking.rt.total_rooms ?? (booking.rt.rooms?.length || 0)}
                  </div>
                </div>
                <div className="rounded-lg bg-emerald-50 p-2 border border-emerald-100">
                  <div className="text-[11px] text-emerald-700">{t("Available")}</div>
                  <div className="text-sm font-bold text-emerald-800">
                    {booking.rt.available}
                  </div>
                </div>
                <div className="rounded-lg bg-rose-50 p-2 border border-rose-100">
                  <div className="text-[11px] text-rose-700">{t("Booked")}</div>
                  <div className="text-sm font-bold text-rose-800">
                    {booking.rt.booked || 0}
                  </div>
                </div>
                <div className="rounded-lg bg-amber-50 p-2 border border-amber-100">
                  <div className="text-[11px] text-amber-700">{t("Maint / OOS")}</div>
                  <div className="text-sm font-bold text-amber-800">
                    {(booking.rt.maintenance || 0) + (booking.rt.out_of_service || 0)}
                  </div>
                </div>
              </div>
            </div>

            {/* Dynamic Room Selection */}
            <div className="rounded-xl border border-zinc-200 bg-white p-3.5 shadow-xs space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-zinc-800">
                  {t("Room Assignment")}
                </span>
                {selectedRoom && (
                  <span className="text-xs font-semibold text-blue-600 flex items-center gap-1">
                    <Check className="size-3" />
                    {t("Selected: {room}", {
                      room: booking.rt.rooms?.find((r) => r.name === selectedRoom)?.room_number || selectedRoom,
                    })}
                  </span>
                )}
              </div>

              {/* Dropdown Room Selector */}
              <div>
                <label className="block">
                  <span className="mb-1 block text-xs font-medium text-zinc-600">{t("Select Room Number")}</span>
                  <select
                    className={inputCls}
                    value={selectedRoom}
                    onChange={(e) => setSelectedRoom(e.target.value)}
                  >
                    <option value="">{t("-- Auto-assign best room on confirmation --")}</option>
                    {booking.rt.free_rooms?.map((rm) => (
                      <option key={rm.name} value={rm.name}>
                        {t("Room {no} (Floor {f} · {hk})", {
                          no: rm.room_number,
                          f: rm.floor || "1",
                          hk: rm.housekeeping_status || "Ready",
                        })}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              {/* Visual Room Selection Grid */}
              {booking.rt.rooms && booking.rt.rooms.length > 0 && (
                <div className="space-y-2 pt-1">
                  <span className="text-xs font-medium text-zinc-500">
                    {t("Or select directly from room grid:")}
                  </span>
                  <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                    {booking.rt.rooms.map((rm) => {
                      const isSelected = selectedRoom === rm.name
                      const isAvail = rm.is_available
                      const isOcc = rm.status === "Occupied"
                      const isMaint = rm.status === "Maintenance"

                      return (
                        <button
                          key={rm.name}
                          type="button"
                          disabled={!isAvail}
                          onClick={() => setSelectedRoom(isSelected ? "" : rm.name)}
                          className={`relative flex flex-col p-2 rounded-lg border text-left transition ${
                            isSelected
                              ? "bg-blue-600 text-white border-blue-700 shadow-md ring-2 ring-blue-500"
                              : isAvail
                              ? "bg-emerald-50/70 border-emerald-300 text-emerald-950 hover:bg-emerald-100 hover:border-emerald-400 cursor-pointer shadow-2xs"
                              : isOcc
                              ? "bg-rose-50 border-rose-200 text-rose-800 cursor-not-allowed opacity-75"
                              : isMaint
                              ? "bg-amber-50 border-amber-200 text-amber-800 cursor-not-allowed opacity-75"
                              : "bg-zinc-100 border-zinc-200 text-zinc-600 cursor-not-allowed opacity-60"
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-bold text-xs">
                              {rm.room_number}
                            </span>
                            <span
                              className={`size-2 rounded-full ${
                                isSelected
                                  ? "bg-white"
                                  : isAvail
                                  ? "bg-emerald-500"
                                  : isOcc
                                  ? "bg-rose-500"
                                  : isMaint
                                  ? "bg-amber-500"
                                  : "bg-zinc-400"
                              }`}
                            />
                          </div>
                          <div className={`mt-0.5 text-[10px] ${isSelected ? "text-blue-100" : "text-zinc-500"}`}>
                            {isSelected ? t("Selected") : rm.status}
                          </div>
                          {rm.housekeeping_status && (
                            <div className={`text-[9px] ${isSelected ? "text-blue-200" : "text-zinc-400"}`}>
                              {rm.housekeeping_status}
                            </div>
                          )}
                        </button>
                      )
                    })}
                  </div>

                  {/* Indicators Legend */}
                  <div className="flex flex-wrap items-center gap-3 pt-1 text-[11px] text-zinc-500">
                    <span className="flex items-center gap-1">
                      <span className="size-2 rounded-full bg-emerald-500" />
                      {t("Available")}
                    </span>
                    <span className="flex items-center gap-1">
                      <span className="size-2 rounded-full bg-blue-600" />
                      {t("Selected")}
                    </span>
                    <span className="flex items-center gap-1">
                      <span className="size-2 rounded-full bg-rose-500" />
                      {t("Occupied")}
                    </span>
                    <span className="flex items-center gap-1">
                      <span className="size-2 rounded-full bg-amber-500" />
                      {t("Maintenance")}
                    </span>
                    <span className="flex items-center gap-1">
                      <span className="size-2 rounded-full bg-zinc-400" />
                      {t("OOS")}
                    </span>
                  </div>
                </div>
              )}
            </div>

            {/* Guest Details */}
            <div className="rounded-xl border border-zinc-200 bg-white p-3.5 shadow-xs space-y-3">
              <span className="text-xs font-bold uppercase tracking-wider text-zinc-800">
                {t("Guest Information")}
              </span>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block">
                  <span className="mb-1 block text-xs font-medium text-zinc-600">
                    {t("Guest name")} <span className="text-rose-500">*</span>
                  </span>
                  <input
                    className={inputCls}
                    value={guest.name}
                    placeholder={t("e.g. John Doe")}
                    autoFocus
                    onChange={(e) => setGuest({ ...guest, name: e.target.value })}
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs font-medium text-zinc-600">{t("Phone")}</span>
                  <input
                    className={inputCls}
                    value={guest.phone}
                    placeholder="+91…"
                    onChange={(e) => setGuest({ ...guest, phone: e.target.value })}
                  />
                </label>
              </div>
            </div>

            {/* Tariff Breakdown Quote */}
            <div className="rounded-xl border border-brand-200 bg-brand-50/40 p-3.5 text-xs text-brand-950 space-y-1.5">
              <div className="font-semibold text-zinc-800">{t("Stay & Pricing Breakdown")}</div>
              <div className="flex justify-between">
                <span className="text-zinc-600">{t("Room Tariff ({nights} {n_lbl})", {
                  nights,
                  n_lbl: nights === 1 ? t("night") : t("nights"),
                })}</span>
                <span>{cur()}{inr(booking.rt.total)}</span>
              </div>
              <div className="flex justify-between border-t border-brand-200/60 pt-1 font-bold text-sm text-zinc-900">
                <span>{t("Total Amount (Taxes included)")}</span>
                <span>{cur()}{inr(booking.rt.total)}</span>
              </div>
            </div>
          </div>
        </Sheet>
      )}

      {/* Full Photo Preview Lightbox */}
      {previewPhoto && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-xs"
          onClick={() => setPreviewPhoto(null)}
        >
          <div
            className="relative max-h-[90vh] max-w-3xl overflow-hidden rounded-2xl bg-zinc-950 p-2 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setPreviewPhoto(null)}
              className="absolute right-4 top-4 z-10 rounded-full bg-black/60 p-1.5 text-white transition hover:bg-black/90 cursor-pointer"
            >
              <X className="size-5" />
            </button>
            <img
              src={previewPhoto.url}
              alt=""
              className="max-h-[75vh] w-auto max-w-full rounded-xl object-contain mx-auto"
            />
            {previewPhoto.caption && (
              <div className="p-3 text-center text-sm font-medium text-zinc-300">
                {previewPhoto.caption}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}


const REASONS = ["Guest request", "Change of plans", "Duplicate booking",
  "Payment failed", "Weather / travel disruption", "Booked elsewhere", "Other"]

/** One trip: legs in date order with their status and money, the
 * confirmation to print, and cancelling the whole trip. A single stay is
 * changed, paid or cancelled from its own reservation. */
function TripSheet({ name, onClose, onChanged }: { name: string; onClose: () => void; onChanged: () => void }) {
  const { t } = useT()
  const [d, setD] = useState<Itinerary | null>(null)
  const [preview, setPreview] = useState<CancelPreview | null>(null)
  const [reason, setReason] = useState(REASONS[0])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const loc = useLocale()
  const { ensureUnlocked } = useCashierAuth()
  const [adv, setAdv] = useState<{ amount: string; mode: string; plan: AdvancePlan | null; key: string } | null>(null)

  const load = () => call<Itinerary>("kamra.crs.get_itinerary", { itinerary: name })
    .then(setD).catch((e) => setError(serverError(e)))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load() }, [name])

  async function askCancel() {
    setError(null)
    try {
      setPreview(await call<CancelPreview>("kamra.crs.cancel_itinerary_preview", { itinerary: name }))
    } catch (e) { setError(serverError(e)) }
  }
  async function cancelTrip() {
    setBusy(true)
    setError(null)
    try {
      setD(await call<Itinerary>("kamra.crs.cancel_itinerary", { itinerary: name, reason }))
      setPreview(null)
      onChanged()
    } catch (e) { setError(serverError(e)) } finally { setBusy(false) }
  }

  async function planAdvance(amount?: string) {
    setError(null)
    try {
      const plan = await call<AdvancePlan>("kamra.crs.trip_advance_preview", {
        itinerary: name, ...(amount ? { amount: Number(amount) } : {}) })
      setAdv({ amount: amount ?? String(plan.amount), mode: adv?.mode ?? loc.payment_modes[0] ?? "Cash", plan,
        // one key per "Take advance": a retry after a lost response replays
        key: adv?.key ?? newIdempotencyKey() })
    } catch (e) {
      setError(serverError(e))
      if (adv) setAdv({ ...adv, plan: null })
    }
  }
  async function takeAdvance() {
    if (!adv?.plan) return
    setBusy(true)
    setError(null)
    try {
      // money action: the till's cashier PIN, as on a single booking's deposit
      await ensureUnlocked()
      setD(await call<Itinerary>("kamra.crs.record_trip_advance", {
        itinerary: name, amount: adv.plan.amount, mode: adv.mode, idempotency_key: adv.key }))
      setAdv(null)
      onChanged()
    } catch (e) { setError(serverError(e)) } finally { setBusy(false) }
  }

  const sym = d?.legs[0]?.currency_symbol ?? ""
  const canAdvance = d?.legs.some((l) => ["Confirmed", "Pending Payment", "Held"].includes(l.status))
  const cancellable = d?.legs.some((l) => l.status === "Confirmed")
  return (
    <Sheet wide title={t("Trip {ref}", { ref: name })}
      description={d ? `${d.guest_name}${d.check_in_date ? ` · ${d.check_in_date} → ${d.check_out_date}` : ""}` : undefined}
      onClose={onClose}
      footer={
        <div className="flex flex-wrap justify-end gap-2">
          <Link to={`/trip/${encodeURIComponent(name)}`}>
            <Button variant="outline"><Printer className="size-4" />{t("Confirmation")}</Button>
          </Link>
          {canAdvance && !adv && d?.total != null && (
            <Button variant="outline" onClick={() => planAdvance()}>{t("Take trip advance")}</Button>
          )}
          {cancellable && !preview && (
            <Button variant="outline" onClick={askCancel}>{t("Cancel whole trip")}</Button>
          )}
        </div>
      }
    >
      {!d && !error && <p className="py-10 text-center text-zinc-400">{t("Loading…")}</p>}
      {error && (
        <div className="mb-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{translate(error)}</div>
      )}
      {d && (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <Badge tone={STATUS_TONE[d.status] ?? "zinc"}>{statusLabel(d.status)}</Badge>
            {d.total != null && (
              <span className="text-sm text-zinc-600">
                {t("Total {amount} · advance paid {paid}", {
                  amount: `${sym}${inr(d.total)}`, paid: `${sym}${inr(d.advance_paid ?? 0)}` })}
                {(d.advance_due ?? 0) > 0 && (
                  <span className="text-amber-700">
                    {" · "}{t("advance due {amount}", { amount: `${sym}${inr(d.advance_due)}` })}
                  </span>
                )}
                {(d.advance_held_cancelled ?? 0) > 0 && (
                  <span>
                    {" · "}{t("still held on cancelled stays {amount}", { amount: `${sym}${inr(d.advance_held_cancelled)}` })}
                  </span>
                )}
              </span>
            )}
          </div>
          <ol className="space-y-2">
            {d.legs.map((l, i) => (
              <li key={l.reservation} className="rounded-lg border border-zinc-200 p-3 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="flex size-5 items-center justify-center rounded-full bg-zinc-800 text-[11px] font-semibold text-white">{i + 1}</span>
                  <span className="font-semibold">{l.property_name}</span>
                  {l.city && <span className="text-xs text-zinc-400">{l.city}</span>}
                  <Badge className="ml-auto" tone={STATUS_TONE[l.status] ?? "zinc"}>{statusLabel(l.status)}</Badge>
                </div>
                <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-zinc-600">
                  <span>{l.check_in_date} → {l.check_out_date}</span>
                  <span>{l.room_type_name}{l.room ? ` · ${l.room}` : ""}</span>
                  <span>{l.currency_symbol}{inr(l.amount_after_tax)}</span>
                  {l.advance_paid > 0 && <span>{t("Paid {amount}", { amount: `${l.currency_symbol}${inr(l.advance_paid)}` })}</span>}
                  {l.deposit_due > 0 && <span className="text-amber-700">{t("Advance due {amount} ({pct}%)", { amount: `${l.currency_symbol}${inr(l.deposit_due)}`, pct: String(l.advance_percent) })}</span>}
                  {l.cancellation_number && <span>{l.cancellation_number}</span>}
                </div>
                <button className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-brand-700 hover:underline"
                  onClick={() => openLeg(l.property, l.reservation)}>
                  <ExternalLink className="size-3" />{t("Open {ref} to change dates, take an advance or cancel this stay", { ref: l.reservation })}
                </button>
              </li>
            ))}
          </ol>
          {adv && (
            <div className="space-y-2 rounded-lg border border-brand-200 bg-brand-50/40 p-3 text-sm">
              <p className="font-medium">{t("One advance for the whole trip")}</p>
              <div className="grid gap-2 sm:grid-cols-3">
                <input className={inputCls} type="number" min={0} aria-label={t("Amount")}
                  value={adv.amount} onChange={(e) => setAdv({ ...adv, amount: e.target.value })}
                  onBlur={() => adv.amount && planAdvance(adv.amount)} />
                <select className={inputCls} aria-label={t("Payment mode")} value={adv.mode}
                  onChange={(e) => setAdv({ ...adv, mode: e.target.value })}>
                  {loc.payment_modes.map((m) => <option key={m} value={m}>{t(m)}</option>)}
                </select>
                <Button variant="outline" onClick={() => planAdvance(adv.amount)}>{t("Show split")}</Button>
              </div>
              {adv.plan && (
                <>
                  <p className="text-xs text-zinc-500">
                    {t("Each stay first gets the advance its own dates ask for, earliest first. Anything more goes to the earliest stay, never past its bill.")}
                  </p>
                  {adv.plan.legs.map((l) => (
                    <div key={l.reservation} className="flex justify-between gap-2">
                      <span>{l.property_name} · {l.check_in_date} · {t("due {amount} ({pct}%)", {
                        amount: `${adv.plan!.currency_symbol}${inr(l.advance_due)}`, pct: String(l.advance_percent) })}</span>
                      <span className="font-medium">{adv.plan!.currency_symbol}{inr(l.share)}</span>
                    </div>
                  ))}
                </>
              )}
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setAdv(null)}>{t("Close")}</Button>
                <Button disabled={busy || !adv.plan || Number(adv.amount) !== adv.plan.amount} onClick={takeAdvance}>
                  {adv.plan ? t("Take {amount}", { amount: `${adv.plan.currency_symbol}${inr(adv.plan.amount)}` }) : t("Take advance")}
                </Button>
              </div>
            </div>
          )}
          {preview && (
            <div className="space-y-2 rounded-lg border border-rose-200 bg-rose-50/50 p-3 text-sm">
              <p className="font-medium">{t("Cancel every confirmed stay, each under its own property's policy:")}</p>
              {preview.legs.map((l) => (
                <div key={l.reservation} className="flex justify-between">
                  <span>{l.property} · {l.reservation}</span>
                  <span>{l.estimated_fee > 0 ? `${l.currency_symbol}${inr(l.estimated_fee)}` : t("No fee")}</span>
                </div>
              ))}
              {preview.not_cancellable.length > 0 && (
                <p className="text-xs text-zinc-500">
                  {t("Not cancelled (already started or finished): {refs}", {
                    refs: preview.not_cancellable.map((x) => x.reservation).join(", ") })}
                </p>
              )}
              <select className={inputCls} value={reason} onChange={(e) => setReason(e.target.value)}>
                {REASONS.map((r) => <option key={r} value={r}>{t(r)}</option>)}
              </select>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setPreview(null)}>{t("Keep trip")}</Button>
                <Button disabled={busy} onClick={cancelTrip}>
                  {preview.total_fee
                    ? t("Cancel trip, fees {amount}", { amount: `${preview.legs[0]?.currency_symbol ?? ""}${inr(preview.total_fee)}` })
                    : t("Cancel trip")}
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </Sheet>
  )
}
