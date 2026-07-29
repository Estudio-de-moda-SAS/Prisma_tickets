export type Holiday = {
  date: string,
  day_of_week: string,
  festivo_name: string,
}

const key = "fs_d2GxwBZHt6Ba8pZQh4UFALrajvV9TOiK"

interface HolidayApi {
  date: string;
  day_of_week_es: string;
  name_es: string;
}

interface HolidayResponse {
  data: HolidayApi[];
}

export async function fetchHolidays(): Promise<Holiday[]> {
  const year = new Date().getFullYear();

  const request = await fetch(
    `https://www.festivos.com.co/api/v1/festivos?year=${year}`,
    {
      headers: {
        Authorization: `Bearer ${key}`,
      },
    }
  );

  if (!request.ok) {
    throw new Error(`Error ${request.status}: ${request.statusText}`);
  }

  const response: HolidayResponse = await request.json();

  return response.data.map((r) => ({
    date: r.date,
    day_of_week: r.day_of_week_es,
    festivo_name: r.name_es,
  }));
}