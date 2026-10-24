import { Encoder, Profile } from "@garmin/fitsdk";
import type { Encodable, FileIdMesg, Mesg, RecordMesg, SessionMesg } from "@garmin/fitsdk";

export const SEMICIRCLES_PER_DEGREE = 2 ** 31 / 180;

export interface TestRecord {
  t: string;
  lat?: number;
  lon?: number;
  ele?: number;
  altitude?: number;
  distance?: number;
}

/** Encodes a small FIT activity with Garmin's encoder. */
export function encodeFit(records: TestRecord[], session?: Partial<SessionMesg>): Uint8Array {
  const encoder = new Encoder();
  const write = <T extends Mesg>(message: Encodable<T>) => encoder.writeMesg(message);
  write<FileIdMesg>({
    mesgNum: Profile.MesgNum.FILE_ID!,
    type: "activity",
    manufacturer: "development",
    product: 1,
    timeCreated: new Date(records[0]?.t ?? "2026-10-24T08:00:00Z"),
  });
  for (const r of records) {
    write<RecordMesg>({
      mesgNum: Profile.MesgNum.RECORD!,
      timestamp: new Date(r.t),
      ...(r.lat !== undefined && { positionLat: Math.round(r.lat * SEMICIRCLES_PER_DEGREE) }),
      ...(r.lon !== undefined && { positionLong: Math.round(r.lon * SEMICIRCLES_PER_DEGREE) }),
      ...(r.ele !== undefined && { enhancedAltitude: r.ele }),
      ...(r.altitude !== undefined && { altitude: r.altitude }),
      ...(r.distance !== undefined && { distance: r.distance }),
    });
  }
  if (session) write<SessionMesg>({ mesgNum: Profile.MesgNum.SESSION!, ...session });
  return encoder.close();
}
