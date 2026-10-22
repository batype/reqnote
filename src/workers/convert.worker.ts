import { convertCurl } from "../core/index";
import type { ConvertOptions } from "../core/index";
self.onmessage = ({
  data,
}: MessageEvent<{ id: number; input: string; options: ConvertOptions }>) => {
  try {
    self.postMessage({
      id: data.id,
      result: convertCurl(data.input, data.options),
    });
  } catch (error) {
    self.postMessage({
      id: data.id,
      error: error instanceof Error ? error.message : "转换失败，请检查输入",
    });
  }
};
