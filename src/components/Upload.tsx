// Upload.tsx
"use client";

import React, { useEffect, useRef, useState } from "react";
import Gallery from "./Gallery";
import type { ImageCardProps } from "./imageCardProps";
import { io, Socket } from "socket.io-client";
import { mosaicBlend } from "./mosaic"; // adjust path if needed

export function Upload() {
  // ===== State
  const [image, setImage] = useState<string | null>(null);
  const [text, setText] = useState("");
  const textArea = useRef<HTMLTextAreaElement>(null);

  const [loading, setLoading] = useState(false);
  const [uploading, setUploadLoading] = useState(false);
  const [showUpload, setShowUpload] = useState(false);
  const [showGallery, setShowGallery] = useState(false);

  // For prompt-based generation within uploader (unchanged)
  const [generatedImage, setGeneratedImage] = useState<string | null>(null);
  const [remixedPrompt, setRemixedPrompt] = useState("");

  // tags
  const [words, setWords] = useState<string[]>([]);
  const [currentWord, setCurrentWord] = useState<string>("");

  // classification
  const [classes, setClasses] = useState<string[]>([]);
  const [currentClass, setCurrentClass] = useState<string>("");

  // communities
  const [community, setCommunity] = useState<string>("");
  const [availableCommunities, setAvailableCommunities] = useState<string[]>(
    []
  );

  // data + pagination
  const [news, setNews] = useState<ImageCardProps[]>([]);
  const [loadIndex, setLoadIndex] = useState<number>(0);
  const [isFetchingRecent, setIsFetchingRecent] = useState(false);

  // misc
  const [error, setError] = useState<string>("");
  const [succes, setSucces] = useState(false);

  // ===== Remix UI (moved here from Gallery)
  const [selectedImages, setSelectedImages] = useState<ImageCardProps[]>([]);
  const [showRemixer, setShowRemixer] = useState(false);
  const [collagedImage, setCollagedImage] = useState<string | null>(null);
  const [remixLoading, setRemixLoading] = useState(false);
  const [selectedParentIds, setSelectedParentIDs] = useState<string[]>([]);

  const [uploadExtras, setUploadExtras] = useState<{
    parentIds?: string[];
    remixedPrompt?: string;
    tagsOverride?: string[];
  } | null>(null);

  // ===== Refs to handle dev strict-mode + re-entrancy
  const didLoadRef = useRef(false);
  const inFlightRef = useRef(false);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const remixerRef = useRef<HTMLElement | null>(null);

  const snapToPane = (pane: "uploader" | "gallery" | "remixer") => {
    const el =
      pane === "remixer"
        ? remixerRef.current
        : pane === "gallery"
        ? (containerRef.current?.children[1] as HTMLElement)
        : (containerRef.current?.children[0] as HTMLElement);

    if (!el || !containerRef.current) return;

    // Only do the horizontal scroll behavior on small screens
    if (window.matchMedia("(max-width: 768px)").matches) {
      containerRef.current.scrollTo({
        left: el.offsetLeft,
        behavior: "smooth",
      });
    }
  };

  // ===== Socket
  const socketRef = useRef<Socket | null>(null);
  useEffect(() => {
    let storedUserId = sessionStorage.getItem("userId");
    if (!storedUserId) {
      storedUserId = Math.random().toString(36).substring(7);
      sessionStorage.setItem("userId", storedUserId);
    }

    const s = io("https://dancingwai-11f115b681e2.herokuapp.com", {
      autoConnect: false,
    });
    socketRef.current = s;
    s.connect();

    const onReceive = (message: any) => console.log("gets io message", message);
    const onConnect = () => console.log("connects");
    const onHello = (msg: any) => console.log("hello", msg);

    s.on("receiveMessage", onReceive);
    s.on("connect", onConnect);
    s.on("hello", onHello);

    return () => {
      s.off("receiveMessage", onReceive);
      s.off("connect", onConnect);
      s.off("hello", onHello);
      s.disconnect();
      socketRef.current = null;
    };
  }, []);

  // ===== Initial load
  useEffect(() => {
    if (didLoadRef.current) return;
    didLoadRef.current = true;
    void fetchRecentImages();
  }, []);

  // ===== Fetch images
  const fetchRecentImages = async () => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;

    const ac = new AbortController();
    setIsFetchingRecent(true);
    setError("");

    try {
      const res = await fetch(
        `/api/cloudinary/recent?skip=${loadIndex}&limit=10`,
        { signal: ac.signal, cache: "no-store" }
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();

      if (Array.isArray(data) && data.length) {
        const mapped: ImageCardProps[] = data.map((d: any) => ({
          title: d.title,
          url: d.url,
          tags: d.tags,

          // ✅ new: fill descriptor using the new Cloudinary context keys you save
          descriptor: {
            title: d.ai_title,
            caption: d.ai_caption,
            altText: d.alt,

            so_me_type: d.ai_so_me_type,
            trend: d.ai_trend,
            feeling: d.ai_feeling,

            subject: d.ai_subject,
            setting: d.ai_setting,
            medium: d.ai_medium,
            realism: d.ai_realism,
            lighting: d.ai_lighting,
            palette: d.ai_palette,
            composition: d.ai_composition,

            style: d.ai_style,

            // if you store these as strings in context, parse them here
            vibe:
              typeof d.ai_vibe === "string"
                ? d.ai_vibe
                    .split(",")
                    .map((s: string) => s.trim())
                    .filter(Boolean)
                : [],
            objects:
              typeof d.ai_objects === "string"
                ? d.ai_objects
                    .split(",")
                    .map((s: string) => s.trim())
                    .filter(Boolean)
                : [],
            people:
              typeof d.ai_people === "string"
                ? d.ai_people
                    .split(",")
                    .map((s: string) => s.trim())
                    .filter(Boolean)
                : [],

            must_keep:
              typeof d.ai_must_keep === "string"
                ? d.ai_must_keep
                    .split(",")
                    .map((s: string) => s.trim())
                    .filter(Boolean)
                : [],
          },

          // legacy fields (optional keep)
          aiCaption: d.caption,
          description: d.alt || "Untitled",
          aiTitle: d.ai_title,
          aiVibe: d.ai_vibe,
          aiObjects: d.ai_objects,
          aiFeeling: d.ai_feeling,
          ai_so_me_type: d.aiSoMeType,
          aiStyle: d.aiStyle,
          aiTrend: d.aiTrend,
          aiPeople: d.aiPeople,

          id: d.id,
          community: d.community,
          parentIds: d.parentIds,
        }));

        setNews((prev) => [...prev, ...mapped]);
        setLoadIndex((prev) => prev + 10);
      }
    } catch (e: any) {
      if (e?.name !== "AbortError") {
        setError(
          e instanceof Error ? e.message : "Failed to fetch recent images"
        );
      }
    } finally {
      setIsFetchingRecent(false);
      inFlightRef.current = false;
    }

    return () => ac.abort();
  };

  // ===== Derive available communities
  useEffect(() => {
    const uniqueFromNews = Array.from(
      new Set(
        news
          .map((n) => n.community?.toLowerCase?.().trim())
          .filter(Boolean) as string[]
      )
    );
    const presets = ["brainrot", "thirsttrap", "lifestyle"];
    const merged = Array.from(new Set([...uniqueFromNews, ...presets]));
    setAvailableCommunities(merged);
  }, [news]);

  // ===== UX helpers
  const showSucces = (duration = 1500) => {
    setSucces(true);
    setTimeout(() => setSucces(false), duration);
  };

  // ----- Tag input handlers
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (
      e.key === " " ||
      e.keyCode === 32 ||
      e.keyCode === 0 ||
      e.key === "Enter"
    ) {
      e.preventDefault();
      if (currentWord.trim()) {
        setWords((prev) => [...prev, currentWord.trim()]);
        setCurrentWord("");
      }
    }
  };
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    if (value.endsWith(" ") || value.endsWith("\n")) {
      if (currentWord.trim()) {
        setWords((prev) => [...prev, currentWord.trim()]);
        setCurrentWord("");
      }
    } else {
      setCurrentWord(value);
    }
  };
  const handleRemoveWord = (index: number) => {
    setWords((prev) => prev.filter((_, i) => i !== index));
  };
  const joinWithComma = (arr: string[]) => arr.join(", ");

  // ----- Classification handlers
  const handleClassKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (
      e.key === " " ||
      e.keyCode === 32 ||
      e.keyCode === 0 ||
      e.key === "Enter"
    ) {
      e.preventDefault();
      if (currentClass.trim()) {
        setClasses((prev) => [...prev, currentClass.trim()]);
        setCurrentClass("");
      }
    }
  };
  const handleClassInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    if (value.endsWith(" ") || value.endsWith("\n")) {
      if (currentClass.trim()) {
        setClasses((prev) => [...prev, currentClass.trim()]);
        setCurrentClass("");
      }
    } else {
      setCurrentClass(value);
    }
  };
  const handleRemoveClass = (index: number) => {
    setClasses((prev) => prev.filter((_, i) => i !== index));
  };

  const clearRemixSelection = () => {
    setSelectedImages([]);
    setGeneratedImage(null); // AI remix preview
    setCollagedImage(null); // collage preview
    setSelectedParentIDs([]);
    setRemixedPrompt("");
    setImage(null); // you set this during remix/collage previews
    setRemixLoading(false);
    setError(""); // optional: clear any stale error
    setUploadExtras(null); // NEW
  };
  // put with your other handlers
  const clearForm = () => {
    // text & prompt bits
    setText("");
    if (textArea.current) textArea.current.value = "";

    // tags & classes
    setWords([]);
    setCurrentWord("");
    setClasses([]);
    setCurrentClass("");

    // community
    setCommunity("");

    // previews & gen
    setImage(null);
    setGeneratedImage(null);

    // misc ui
    setError("");
    setSucces(false);
    setLoading(false);
    setUploadLoading(false);

    setUploadExtras(null); // NEW
  };

  // ===== Generation inside Upload (prompt-based)
  const generateImage = async () => {
    setLoading(true);
    const promptText = textArea.current?.value ?? "";

    if (promptText !== "" || words.length > 0) {
      try {
        const response = await fetch(
          `/api/generateImage?prompt=${encodeURIComponent(
            promptText || "utopias"
          )}&remixed=yes&adjectives=${encodeURIComponent(
            joinWithComma(words) || ""
          )}`
        );
        const data = await response.json();

        if (!response.ok) throw new Error(data.error || "Generation failed");
        setImage(null);
        setGeneratedImage(data.imageUrl);
        setRemixedPrompt(data.remixedPrompt);
        setText(data.prompt);
      } catch {
        setError("that didnt work");
      } finally {
        setLoading(false);
      }
    } else {
      setError("Alchymist, you need to describe your utopia fragment");
      setLoading(false);
    }
  };

  // ===== Remix flows (moved here)
  const onToggleSelection = (image: ImageCardProps) => {
    setSelectedImages((prev) =>
      prev.some((img) => img.url === image.url)
        ? prev.filter((img) => img.url !== image.url)
        : [...prev, image]
    );
  };

  const generateRemixImage = async () => {
    setRemixLoading(true);
    setCollagedImage(null);

    if (selectedImages.length <= 1) {
      setRemixLoading(false);
      return;
    }

    try {
      // lineage (keep what you already do)
      const parentUrls = selectedImages.map((img) => img.url).filter(Boolean);
      setSelectedParentIDs(parentUrls);

      // helper
      const uniq = (arr: string[]) =>
        Array.from(new Set(arr.filter(Boolean).map((s) => String(s).trim())));

      // Build "parents" array in the new format
      const parents = selectedImages.map((el) => {
        // Prefer a single descriptor object if you store it
        // e.g. el.ai (full object) or el.descriptor
        const d = el.descriptor || {};

        // If your data is currently flat like el.aiStyle, el.aiObjects, etc.,
        // map it into the new descriptor shape (best-effort).
        const objects = Array.isArray(d.objects)
          ? d.objects
          : typeof el.aiObjects === "string"
          ? el.aiObjects
              .split(",")
              .map((s: string) => s.trim())
              .filter(Boolean)
          : [];

        const vibe = Array.isArray(d.vibe)
          ? d.vibe
          : typeof el.aiVibe === "string"
          ? el.aiVibe
              .split(",")
              .map((s: string) => s.trim())
              .filter(Boolean)
          : [];

        const people = Array.isArray(d.people)
          ? d.people
          : (() => {
              // some of your older records store JSON string
              if (!el.aiPeople) return [];
              try {
                const parsed =
                  typeof el.aiPeople === "string"
                    ? JSON.parse(el.aiPeople)
                    : el.aiPeople;
                return Array.isArray(parsed) ? parsed.map(String) : [];
              } catch {
                return [];
              }
            })();

        const mustKeep = Array.isArray(d.must_keep)
          ? d.must_keep
          : uniq([
              ...(objects.slice(0, 4) || []),
              ...(vibe[0] ? [vibe[0]] : []),
              ...(people[0] ? [people[0]] : []),
            ]).slice(0, 8);

        const descriptor = {
          title: d.title || el.aiTitle || el.title || "",
          description: d.description || el.description || "",
          subject: d.subject || "",
          setting: d.setting || "",
          medium: d.medium || "",
          realism: d.realism || "",
          lighting: d.lighting || "",
          palette: d.palette || "",
          composition: d.composition || "",
          style: d.style || el.aiStyle || "",
          trend: d.trend || el.aiTrend || "",
          feeling: d.feeling || el.aiFeeling || "",
          objects,
          vibe,
          people,
          must_keep: mustKeep,
        };

        return { url: el.url, descriptor };
      });

      console.log(parents);

      // tags/adjectives still useful (optional)
      const tagWords = uniq(
        selectedImages.flatMap((el) =>
          (el.tags || []).map((t: any) => String(t))
        )
      );

      // keep your uploader extras if you want
      setUploadExtras({
        parentIds: parentUrls,
        remixedPrompt: tagWords.join(", "),
        tagsOverride: tagWords,
      });

      const payload = {
        parents,
        adjectives: tagWords.join(", "),
        communities: uniq(
          selectedImages.map((el) => el.community).filter(Boolean)
        ),
        trends: uniq(selectedImages.map((el) => el.aiTrend).filter(Boolean)),
        extraPrompt: "", // optional UI field if you add it
        size: "1024x1024",
      };

      const response = await fetch(`/api/generateImage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Remix failed");

      setRemixedPrompt(data.remixedPrompt || "");
      setText(data.title || "");
      if (tagWords.length) setWords(tagWords);

      setGeneratedImage(data.imageUrl);
      setImage(data.imageUrl);
    } catch (err) {
      console.error(err);
      setError("remix generation failed");
    } finally {
      setRemixLoading(false);
    }
  };

  const generateRemixCollage = async () => {
    if (selectedImages.length < 2) return;
    setRemixLoading(true);
    setGeneratedImage(null);
    try {
      const ids = selectedImages.map((i) => i.url);
      setSelectedParentIDs(ids);

      const dataUrl = (await mosaicBlend(ids, {
        size: 1024,
        block: 32,
        returnType: "dataURL",
        seed: undefined,
      })) as string;

      if (!text) setText("collage of fragments");
      if (words.length === 0) {
        const tags = selectedImages.flatMap((i) => i.tags || []);
        setWords(tags);
      }
      setImage(dataUrl);
      setCollagedImage(dataUrl);

      setUploadExtras({
        parentIds: ids,
        remixedPrompt: "",
        tagsOverride: [],
      });
    } catch {
      setError("collage failed");
    } finally {
      setRemixLoading(false);
    }
  };

  // ===== Unified Upload (supports normal + remix)
  const upLoadImage = async (
    _image: string,
    extras?: {
      parentIds?: string[];
      remixedPrompt?: string;
      tagsOverride?: string[];
    }
  ) => {
    try {
      setUploadLoading(true);
      const promptText = textArea.current?.value ?? "";

      console.log("IMAGE UPLOAD NOW", _image, extras);

      if (_image != null) {
        const response = await fetch(`/api/cloudinary/upload`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            imageUrl: _image,
            title: promptText || "_",
            tags: joinWithComma(extras?.tagsOverride ?? words),
            classes: joinWithComma(classes),
            community,
            parentIds: extras?.parentIds,
            remixedPrompt: extras?.remixedPrompt,
          }),
        });

        const data = await response.json();
        if (!response.ok) {
          setError("this image is bad");
          throw new Error(data.error || "Upload failed");
        } else {
          const card: ImageCardProps = {
            title: data.title,
            url: data.url,
            tags: data.tags,
            aiCaption: data.caption,
            description: data.alt || "Untitled",
            aiTitle: data.ai_title,
            aiVibe: data.ai_vibe,
            aiObjects: data.ai_objects,
            aiFeeling: data.ai_feeling,
            id: data.id,
            community: data.community,
            parentIds: data.parentIds,
            ai_so_me_type: data.aiSoMeType,
            aiStyle: data.aiStyle,
            aiTrend: data.aiTrend,
            aiPeople: data.aiPeople,
          };

          shareImageToSocket(card);
          poorImageIntoCouldron(card);
        }
      } else {
        setError("Alchymist, you need to invent a scene");
      }
    } catch {
      setError("image is bad");
    } finally {
      // reset UI
      setLoading(false);
      setUploadLoading(false);
      setShowUpload(false);
      setImage(null);
      setText("");
      setCommunity("");
      setClasses([]);
      setWords([]);
      setGeneratedImage(null);
      setCollagedImage(null);
      setSelectedParentIDs([]);
      setSelectedImages([]);
      setShowRemixer(false);
    }
  };

  // ===== File & socket helpers
  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => setImage(reader.result as string);
      reader.readAsDataURL(file);
    }
  };
  const shareImageToSocket = (_image: ImageCardProps) => {
    socketRef.current?.emit("hello", _image);
  };
  const poorImageIntoCouldron = (_image: ImageCardProps) => {
    setNews((prev) => [_image, ...prev]);
    showSucces();
    setImage(null);
    setGeneratedImage(null);
    setShowGallery(false);
    setLoading(false);
    setUploadLoading(false);
    setShowUpload(false);
    setText("");
    setWords([]);
    setGeneratedImage(null);
  };

  // ===== Submit
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    if (image) {
      await upLoadImage(image, uploadExtras ?? undefined);
    } else if (generatedImage) {
      await upLoadImage(generatedImage, uploadExtras ?? undefined);
    } else {
      setLoading(false);
      // no image provided
    }
  };

  const hasFormData =
    !!image ||
    !!generatedImage ||
    text.trim().length > 0 ||
    words.length > 0 ||
    classes.length > 0 ||
    community.trim().length > 0;

  // ===== Render
  return (
    <div className="mainContainer">
      <form
        onSubmit={handleSubmit}
        className={uploading ? "uploading uploader" : "uploader"}
      >
        <p>contribute to the image ecology simulation</p>

        <div className="uploaderButtons">
          <label
            htmlFor="image-upload"
            className={
              !loading
                ? "imgUploadBtn active super-default"
                : "imgUploadBtn passive super-default"
            }
          >
            {image ? "upload another image" : "upload new image"}
          </label>
          <input
            id="image-upload"
            type="file"
            accept="image/*"
            onChange={handleImageChange}
            className="sr-only"
          />
        </div>

        <div className="imageResultContainer">
          {" "}
          <div className="imageResult">
            {image ? (
              <>
                <button
                  className="closebtn"
                  type="button"
                  onClick={() => setImage(null)}
                >
                  X
                </button>
                <img src={image} alt="Preview" className="subImage" />
              </>
            ) : null}
            {uploading ? <div className="loaderAnim"></div> : null}
          </div>
        </div>

        <div className={error ? "textinputs error" : "textinputs"}>
          <p>image description</p>
          <textarea
            ref={textArea}
            id="text"
            value={text}
            autoCorrect="false"
            onChange={(e) => setText(e.target.value)}
            placeholder="describe the image"
          />
        </div>

        <div className={error ? "wordinputs error" : "wordinputs"}>
          <p>image tagging</p>
          <input
            type="text"
            value={currentWord}
            autoCorrect="false"
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            className="mt-2 p-2 border rounded-md"
            placeholder="optional: tag the image"
          />
          <div className="flex-row-wrap adjButtons">
            {words.map((word, index) => (
              <button
                key={`${word}-${index}`}
                type="button"
                onClick={() => handleRemoveWord(index)}
                className="adjBtn"
              >
                {word} ✖
              </button>
            ))}
          </div>
        </div>

        <div className={error ? "textinputs error" : "textinputs"}>
          <p>image classification</p>
          <input
            type="text"
            value={currentClass}
            autoCorrect="false"
            onChange={handleClassInputChange}
            onKeyDown={handleClassKeyDown}
            className="mt-2 p-2 border rounded-md"
            placeholder="optional: image population/type"
          />
          <div className="flex-row-wrap adjButtons">
            {classes.map((cls, index) => (
              <button
                key={`${cls}-${index}`}
                onClick={() => handleRemoveClass(index)}
                className="adjBtn"
                type="button"
              >
                {cls} ✖
              </button>
            ))}
          </div>
        </div>

        <div className={error ? "textinputs error" : "textinputs"}>
          <p>community</p>
          <div className="flex-row-wrap adjButtons">
            {availableCommunities.map((comm) => (
              <button
                key={comm}
                type="button"
                onClick={() => setCommunity(comm)}
                className={`adjBtn ${community === comm ? "active" : ""}`}
              >
                {comm}
              </button>
            ))}
          </div>
          <input
            type="text"
            value={community}
            onChange={(e) => setCommunity(e.target.value.toLowerCase())}
            placeholder="or write your own community"
            className="mt-2 p-2 border rounded-md"
            autoCorrect="false"
          />
        </div>

        <div
          className={
            !hasFormData ? "uploaderButtons right" : "uploaderButtons between"
          }
        >
          {hasFormData && (
            <button type="button" className="super-default" onClick={clearForm}>
              clear form
            </button>
          )}
          <button
            type="submit"
            className={
              loading
                ? "passive super-default"
                : generatedImage
                ? "active super-default"
                : image
                ? "active super-default"
                : "passive super-default"
            }
          >
            {loading ? "loading content" : <>upload</>}
          </button>
          {/* OPTIONAL: generate from prompt
          <button
            type="button"
            onClick={generateImage}
            className={!loading ? "active" : "passive"}
            disabled={loading}
            style={{ marginLeft: 8 }}
          >
            {generatedImage ? "regenerate (AI)" : "generate (AI)"}
          </button> */}
        </div>

        {succes && (
          <div className="succes">
            <p>upload complete</p>
          </div>
        )}
        {error && error !== "" && (
          <div
            className="succes error"
            onClick={() => {
              setError("");
            }}
          >
            <p>{error}</p>
          </div>
        )}
      </form>

      {/* MIDDLE: Gallery */}
      <div className="gallery">
        <Gallery
          news={news}
          communityCategories={availableCommunities}
          selectedImages={selectedImages}
          onToggleSelection={onToggleSelection}
          onOpenRemixer={() => {
            setShowRemixer(true);
            snapToPane("remixer"); // scrolls to the right pane on mobile
          }}
        />
        {!isFetchingRecent && (
          <div style={{ marginTop: 16 }}>
            <button
              type="button"
              className="adjBtn"
              onClick={() => fetchRecentImages()}
            >
              load more
            </button>
          </div>
        )}
      </div>

      {/* RIGHT: Remixer panel (used to be the overlay) */}
      <aside className={`remixer open"}`} ref={remixerRef}>
        <p>remix images from the ecology simulation</p>

        <div className="uploaderButtons galleryUploaderButtons">
          <button
            disabled={remixLoading}
            className={
              !remixLoading ? "active super-default" : "passive super-default"
            }
            onClick={(e) => {
              e.preventDefault();
              generateRemixImage();
            }}
          >
            {generatedImage ? "recreate AI remix" : "AI remix"}
          </button>

          <button
            disabled={remixLoading}
            className={
              !remixLoading ? "active super-default" : "passive super-default"
            }
            onClick={(e) => {
              e.preventDefault();
              generateRemixCollage();
            }}
          >
            {collagedImage ? "reblend collage" : "collage"}
          </button>

          {/* <button
            type="button"
            onClick={() => {
              const imgToUpload = generatedImage || collagedImage;
              if (imgToUpload) {
                upLoadImage(imgToUpload, {
                  parentIds: selectedParentIds,
                  remixedPrompt: remixedPrompt || text,
                  tagsOverride: words,
                });
              }
            }}
            className={
              remixLoading
                ? "passive"
                : generatedImage || collagedImage
                ? "active"
                : "passive"
            }
          >
            {remixLoading ? "loading content" : <>pour into potion</>}
          </button> */}
        </div>
        <div className="imageResultContainer">
          <div className="imageResult">
            {remixLoading ? (
              <div className="loaderAnim"></div>
            ) : generatedImage ? (
              <img
                src={generatedImage}
                alt="Generated"
                className="w-full rounded-lg"
              />
            ) : collagedImage ? (
              <img
                src={collagedImage}
                alt="Generated"
                className="w-full rounded-lg"
              />
            ) : (
              <>
                <div
                  className=" remixSelection"
                  style={
                    {
                      ["--cols" as any]: Math.max(
                        1,
                        Math.ceil(Math.sqrt(selectedImages.length))
                      ),
                      ["--rows" as any]: Math.max(
                        1,
                        Math.ceil(
                          selectedImages.length /
                            Math.max(
                              1,
                              Math.ceil(Math.sqrt(selectedImages.length))
                            )
                        )
                      ),
                      ["--gap" as any]: "8px",
                      ["--radius" as any]: "8px",
                    } as React.CSSProperties
                  }
                >
                  {selectedImages.map((img, index) => (
                    <img src={img.url} key={index} />
                  ))}
                </div>

                {selectedImages.length < 2 && (
                  <p className="imageNotice">
                    u need at least 2 images from the db
                  </p>
                )}
              </>
            )}
          </div>
        </div>
        {selectedImages.length > 0 && (
          <div className="uploaderButtons right">
            <button
              type="button"
              onClick={clearRemixSelection}
              className="super-default"
            >
              clear remix
            </button>
          </div>
        )}
      </aside>
    </div>
  );
}
