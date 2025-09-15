import React, { useState, useRef, ChangeEvent, useEffect } from 'react';
import { Upload, Camera, CheckCircle, AlertCircle, FileText, Shield, X, ChevronRight, Loader2 } from 'lucide-react';

// Define types for form data
interface FormData {
  documentType: 'passport' | 'id_card' | 'drivers_license';
  country: string;
}

// Define type for errors
interface FormErrors {
  country?: string;
  documentFront?: string;
  documentBack?: string;
  selfie?: string;
}

const KYCSubmissionWebsite: React.FC = () => {
  const [currentStep, setCurrentStep] = useState<number>(1); // 1 = Document, 2 = Selfie
  const [formData, setFormData] = useState<FormData>({
    documentType: 'passport',
    country: ''
  });
  const [documentFrontFile, setDocumentFrontFile] = useState<File | null>(null);
  const [documentBackFile, setDocumentBackFile] = useState<File | null>(null);
  const [selfieFile, setSelfieFile] = useState<File | null>(null);
  const [documentFrontPreview, setDocumentFrontPreview] = useState<string | null>(null);
  const [documentBackPreview, setDocumentBackPreview] = useState<string | null>(null);
  const [selfiePreview, setSelfiePreview] = useState<string | null>(null);
  const [errors, setErrors] = useState<FormErrors>({});
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [submitSuccess, setSubmitSuccess] = useState<boolean>(false);
  const [showCamera, setShowCamera] = useState<boolean>(false);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  
  const frontFileInputRef = useRef<HTMLInputElement>(null);
  const backFileInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Cleanup function to stop camera when component unmounts or when leaving camera view
  useEffect(() => {
    const currentStream = stream;
    
    return () => {
      if (currentStream) {
        currentStream.getTracks().forEach(track => {
          track.stop();
        });
      }
    };
  }, [stream]);

  const validateStep1 = (): boolean => {
    const newErrors: FormErrors = {};
    if (!formData.country) newErrors.country = 'Country is required';

    // Always require front document
    if (!documentFrontFile) newErrors.documentFront = 'Please upload the front of your document';

    // Require back only for ID card or driver's license
    if (['id_card', 'drivers_license'].includes(formData.documentType) && !documentBackFile) {
      newErrors.documentBack = 'Please upload the back of your document';
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const validateStep2 = (): boolean => {
    const newErrors: FormErrors = {};
    if (!selfieFile) newErrors.selfie = 'Please capture a selfie';
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleInputChange = (e: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    if (errors[name as keyof FormErrors]) {
      setErrors(prev => ({ ...prev, [name]: undefined }));
    }
  };

  const handleFileUpload = (
    e: ChangeEvent<HTMLInputElement>,
    type: 'front' | 'back'
  ) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 5 * 1024 * 1024) {
        setErrors(prev => ({ ...prev, [`document${type.charAt(0).toUpperCase() + type.slice(1)}`]: 'File size must be less than 5MB' }));
        return;
      }
      
      const reader = new FileReader();
      reader.onloadend = () => {
        if (type === 'front') {
          setDocumentFrontFile(file);
          setDocumentFrontPreview(reader.result as string);
          setErrors(prev => ({ ...prev, documentFront: undefined }));
        } else if (type === 'back') {
          setDocumentBackFile(file);
          setDocumentBackPreview(reader.result as string);
          setErrors(prev => ({ ...prev, documentBack: undefined }));
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const startCamera = async () => {
    setCameraError(null);
    setShowCamera(true);
    
    try {
      // Check if getUserMedia is available
      if (!navigator.mediaDevices) {
        // Try the older API as fallback
        if (!(navigator as any).webkitGetUserMedia && !(navigator as any).mozGetUserMedia && !(navigator as any).msGetUserMedia) {
          throw new Error('Camera API not supported in this browser. For Android devices, please try Chrome, Firefox, or Samsung Internet Browser.');
        }
        throw new Error('Camera API not supported in this browser. For Android devices, please try Chrome, Firefox, or Samsung Internet Browser.');
      }
      
      if (!navigator.mediaDevices.getUserMedia) {
        throw new Error('Camera API not supported in this browser. For Android devices, please try Chrome, Firefox, or Samsung Internet Browser.');
      }

      // Special handling for Android browsers
      const isAndroid = /Android/i.test(navigator.userAgent);
      if (isAndroid) {
        // On Android, some browsers require HTTPS for camera access
        if (window.location.protocol !== 'https:' && window.location.hostname !== 'localhost') {
          throw new Error('Camera access on Android requires HTTPS. Please use a secure connection or try a different browser.');
        }
      }

      // Try different constraint configurations
      const constraintsOptions = [
        // Preferred constraints
        {
          video: {
            facingMode: 'user',
            width: { ideal: 1280 },
            height: { ideal: 720 }
          },
          audio: false
        },
        // Fallback constraints
        {
          video: {
            facingMode: 'user',
            width: { min: 640, ideal: 1280, max: 1920 },
            height: { min: 480, ideal: 720, max: 1080 }
          },
          audio: false
        },
        // Minimal constraints
        {
          video: {
            facingMode: 'user'
          },
          audio: false
        },
        // Even more minimal constraints
        {
          video: true,
          audio: false
        }
      ];

      let mediaStream: MediaStream | null = null;
      let lastError: any = null;

      // Try each constraint configuration
      for (const constraints of constraintsOptions) {
        try {
          mediaStream = await navigator.mediaDevices.getUserMedia(constraints);
          break; // Success, exit the loop
        } catch (error) {
          lastError = error;
          console.warn('Camera constraints failed:', constraints, error);
        }
      }

      // If all attempts failed, throw the last error
      if (!mediaStream) {
        throw lastError;
      }

      setStream(mediaStream);
      
      // Set the srcObject directly without timeout for better reliability
      if (videoRef.current) {
        // Clear any existing stream
        if (videoRef.current.srcObject) {
          const oldStream = videoRef.current.srcObject as MediaStream;
          oldStream.getTracks().forEach(track => track.stop());
        }
        
        videoRef.current.srcObject = mediaStream;
        
        // Add event listener for when video is ready to play
        videoRef.current.onloadeddata = () => {
          // Video has data, attempt to play
          videoRef.current?.play().catch(err => {
            console.error('Error playing video:', err);
            setCameraError('Error starting camera. Please try again or use a different browser.');
          });
        };
        
        // Handle video errors
        videoRef.current.onerror = (event) => {
          console.error('Video error:', event);
          setCameraError('Error starting camera. Please try again or use a different browser.');
        };
      }
      
    } catch (err: any) {
      console.error('Camera error:', err);
      let errorMessage = 'Unable to access camera. ';
      
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        errorMessage += 'Please allow camera permissions in your browser settings.';
      } else if (err.name === 'NotFoundError' || err.name === 'OverconstrainedError') {
        errorMessage += 'No camera found on this device.';
      } else if (err.name === 'NotReadableError' || err.name === 'TrackStartError') {
        errorMessage += 'Camera is already in use by another application.';
      } else if (err.message && err.message.includes('secure context')) {
        errorMessage += 'Camera access requires a secure context (HTTPS). Please ensure you are using HTTPS.';
      } else if (err.message && err.message.includes('supported in this browser')) {
        errorMessage += 'Camera API not supported in this browser. For Android devices, please try Chrome, Firefox, or Samsung Internet Browser.';
      } else if (err.message && err.message.includes('HTTPS')) {
        errorMessage += 'Camera access on Android requires HTTPS. Please use a secure connection or try a different browser.';
      } else {
        errorMessage += 'Please check your camera connection and try again. Error: ' + (err.message || err.name);
      }
      
      setCameraError(errorMessage);
      setErrors(prev => ({ ...prev, selfie: errorMessage }));
      setShowCamera(false); // Hide camera view on error
    }
  };

  const stopCamera = () => {
    if (stream) {
      stream.getTracks().forEach(track => {
        track.stop();
      });
      setStream(null);
    }
    setShowCamera(false);
    setCameraError(null);
  };

  const capturePhoto = () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    
    if (!video || !canvas) {
      setCameraError('Camera elements not ready. Please try again.');
      return;
    }
    
    if (video.videoWidth === 0 || video.videoHeight === 0) {
      setCameraError('Camera stream not ready. Please wait a moment and try again.');
      return;
    }
    
    try {
      // Set canvas dimensions to match video
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      
      // Get canvas context
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        throw new Error('Unable to get canvas context');
      }
      
      // Draw video frame to canvas
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      
      // Convert to blob
      canvas.toBlob((blob) => {
        if (!blob) {
          setCameraError('Failed to capture image. Please try again.');
          return;
        }
        
        // Create file from blob
        const file = new File([blob], 'selfie.jpg', { type: 'image/jpeg' });
        setSelfieFile(file);
        setSelfiePreview(canvas.toDataURL('image/jpeg'));
        stopCamera();
        setErrors(prev => ({ ...prev, selfie: undefined }));
        
      }, 'image/jpeg', 0.9);
      
    } catch (err: any) {
      console.error('Capture error:', err);
      setCameraError('Error capturing photo: ' + (err.message || 'Unknown error'));
    }
  };

  const handleNext = () => {
    if (currentStep === 1 && validateStep1()) {
      setCurrentStep(2);
      // Start camera automatically when entering selfie step
      if (!showCamera && !selfieFile) {
        setTimeout(startCamera, 300); // Small delay to ensure DOM is ready
      }
    } else if (currentStep === 2 && validateStep2()) {
      handleSubmit();
    }
  };

  const handleSubmit = async () => {
    setIsSubmitting(true);
    
    // Simulate API submission
    setTimeout(() => {
      setIsSubmitting(false);
      setSubmitSuccess(true);
    }, 2000);
  };

  const resetForm = () => {
    setCurrentStep(1);
    setFormData({
      documentType: 'passport',
      country: ''
    });
    setDocumentFrontFile(null);
    setDocumentBackFile(null);
    setSelfieFile(null);
    setDocumentFrontPreview(null);
    setDocumentBackPreview(null);
    setSelfiePreview(null);
    setErrors({});
    setSubmitSuccess(false);
    setCameraError(null);
    
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
      setStream(null);
    }
    setShowCamera(false);
  };

  if (submitSuccess) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-xl p-8 max-w-md w-full text-center">
          <div className="mb-6">
            <CheckCircle className="w-20 h-20 text-green-500 mx-auto mb-4" />
            <h2 className="text-2xl font-bold text-gray-800 mb-2">Verification Submitted!</h2>
            <p className="text-gray-600">Your KYC documents have been successfully submitted for review.</p>
          </div>
          <div className="bg-blue-50 rounded-lg p-4 mb-6">
            <p className="text-sm text-blue-800">
              Our team will review your submission within 24-48 hours. You'll receive an email confirmation once the verification is complete.
            </p>
          </div>
          <button
            onClick={resetForm}
            className="w-full bg-blue-600 text-white py-3 px-6 rounded-lg font-medium hover:bg-blue-700 transition-colors"
          >
            Submit Another Application
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 py-6 px-4">
      <div className="max-w-4xl mx-auto">
        {/* Compact Header */}
        <div className="bg-white rounded-xl shadow-lg p-4 mb-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center">
              <div className="inline-flex items-center justify-center w-10 h-10 bg-blue-600 text-white rounded-lg mr-3">
                <Shield className="w-5 h-5" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-gray-800">Identity Verification</h1>
                <p className="text-sm text-gray-600">Complete your KYC in 2 steps</p>
              </div>
            </div>
            <div className="hidden md:flex items-center space-x-4 text-sm">
              <div className={`flex items-center ${currentStep >= 1 ? 'text-blue-600' : 'text-gray-400'}`}>
                <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs mr-2 ${
                  currentStep >= 1 ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-500'
                }`}>
                  {documentFrontFile ? <CheckCircle className="w-4 h-4" /> : '1'}
                </div>
                <span>Document</span>
              </div>
              <div className={`flex items-center ${currentStep >= 2 ? 'text-blue-600' : 'text-gray-400'}`}>
                <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs mr-2 ${
                  currentStep >= 2 && selfieFile ? 'bg-blue-600 text-white' : currentStep >= 2 ? 'bg-blue-100 text-blue-600' : 'bg-gray-200 text-gray-500'
                }`}>
                  {selfieFile ? <CheckCircle className="w-4 h-4" /> : '2'}
                </div>
                <span>Selfie</span>
              </div>
            </div>
          </div>
        </div>

        {/* Mobile Step Status */}
        <div className="md:hidden bg-white rounded-lg p-3 mb-6 shadow-sm">
          <div className="flex items-center justify-between text-sm">
            <div className="flex items-center space-x-2">
              <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs ${
                currentStep >= 1 ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-500'
              }`}>
                {documentFrontFile ? <CheckCircle className="w-4 h-4" /> : '1'}
              </div>
              <span className={currentStep >= 1 ? 'font-medium text-blue-600' : 'text-gray-500'}>Document</span>
            </div>
            
            <div className="flex-1 mx-3">
              <div className={`h-1 rounded-full ${currentStep > 1 ? 'bg-blue-600' : 'bg-gray-200'}`}></div>
            </div>
            
            <div className="flex items-center space-x-2">
              <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs ${
                currentStep >= 2 && selfieFile ? 'bg-blue-600 text-white' : currentStep >= 2 ? 'bg-blue-100 text-blue-600' : 'bg-gray-200 text-gray-500'
              }`}>
                {selfieFile ? <CheckCircle className="w-4 h-4" /> : '2'}
              </div>
              <span className={currentStep >= 2 ? 'font-medium text-blue-600' : 'text-gray-500'}>Selfie</span>
            </div>
          </div>
        </div>

        {/* Form Container */}
        <div className="bg-white rounded-2xl shadow-xl p-6 md:p-8">
          {/* Step 1: Document Upload */}
          {currentStep === 1 && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <h2 className="text-xl md:text-2xl font-semibold text-gray-800 flex items-center">
                  <FileText className="w-5 h-5 md:w-6 md:h-6 mr-2 text-blue-600" />
                  Document Upload
                </h2>
                <div className="hidden md:block bg-blue-100 text-blue-800 text-sm px-3 py-1 rounded-full font-medium">
                  Step 1 of 2
                </div>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Document Type *
                  </label>
                  <select
                    name="documentType"
                    value={formData.documentType}
                    onChange={handleInputChange}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  >
                    <option value="passport">Passport</option>
                    <option value="id_card">National ID Card</option>
                    <option value="drivers_license">Driver's License</option>
                  </select>
                </div>
                
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Issuing Country *
                  </label>
                  <input
                    type="text"
                    name="country"
                    value={formData.country}
                    onChange={handleInputChange}
                    className={`w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                      errors.country ? 'border-red-500' : 'border-gray-300'
                    }`}
                    placeholder="United States"
                  />
                  {errors.country && (
                    <p className="mt-1 text-sm text-red-500">{errors.country}</p>
                  )}
                </div>
              </div>

              {/* FRONT DOCUMENT UPLOAD */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Upload Front of Document *
                </label>
                <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center hover:border-blue-500 transition-colors">
                  {documentFrontPreview ? (
                    <div className="relative">
                      <img 
                        src={documentFrontPreview} 
                        alt="Front document preview" 
                        className="max-h-64 mx-auto rounded-lg"
                      />
                      <button
                        onClick={() => {
                          setDocumentFrontFile(null);
                          setDocumentFrontPreview(null);
                        }}
                        className="absolute top-2 right-2 bg-red-500 text-white p-2 rounded-full hover:bg-red-600"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ) : (
                    <>
                      <Upload className="w-12 h-12 text-gray-400 mx-auto mb-3" />
                      <p className="text-gray-600 mb-2">Click to upload or drag and drop</p>
                      <p className="text-sm text-gray-500">PNG, JPG up to 5MB</p>
                      <input
                        ref={frontFileInputRef}
                        type="file"
                        accept="image/*"
                        onChange={(e) => handleFileUpload(e, 'front')}
                        className="hidden"
                      />
                      <button
                        onClick={() => frontFileInputRef.current?.click()}
                        className="mt-4 bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 transition-colors"
                      >
                        Choose Front File
                      </button>
                    </>
                  )}
                </div>
                {errors.documentFront && (
                  <p className="mt-1 text-sm text-red-500">{errors.documentFront}</p>
                )}
              </div>

              {/* BACK DOCUMENT UPLOAD (conditional) */}
              {['id_card', 'drivers_license'].includes(formData.documentType) && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Upload Back of Document *
                  </label>
                  <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center hover:border-blue-500 transition-colors">
                    {documentBackPreview ? (
                      <div className="relative">
                        <img 
                          src={documentBackPreview} 
                          alt="Back document preview" 
                          className="max-h-64 mx-auto rounded-lg"
                        />
                        <button
                          onClick={() => {
                            setDocumentBackFile(null);
                            setDocumentBackPreview(null);
                          }}
                          className="absolute top-2 right-2 bg-red-500 text-white p-2 rounded-full hover:bg-red-600"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    ) : (
                      <>
                        <Upload className="w-12 h-12 text-gray-400 mx-auto mb-3" />
                        <p className="text-gray-600 mb-2">Click to upload or drag and drop</p>
                        <p className="text-sm text-gray-500">PNG, JPG up to 5MB</p>
                        <input
                          ref={backFileInputRef}
                          type="file"
                          accept="image/*"
                          onChange={(e) => handleFileUpload(e, 'back')}
                          className="hidden"
                        />
                        <button
                          onClick={() => backFileInputRef.current?.click()}
                          className="mt-4 bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 transition-colors"
                        >
                          Choose Back File
                        </button>
                      </>
                    )}
                  </div>
                  {errors.documentBack && (
                    <p className="mt-1 text-sm text-red-500">{errors.documentBack}</p>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Step 2: Selfie Verification */}
          {currentStep === 2 && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <h2 className="text-xl md:text-2xl font-semibold text-gray-800 flex items-center">
                  <Camera className="w-5 h-5 md:w-6 md:h-6 mr-2 text-blue-600" />
                  Selfie Verification
                </h2>
                <div className="hidden md:block bg-blue-100 text-blue-800 text-sm px-3 py-1 rounded-full font-medium">
                  Step 2 of 2
                </div>
              </div>
              
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                <div className="flex items-start">
                  <AlertCircle className="w-5 h-5 text-amber-600 mt-0.5 mr-2 flex-shrink-0" />
                  <div className="text-sm text-amber-800">
                    <p className="font-medium mb-1">Tips for a good selfie:</p>
                    <ul className="list-disc list-inside space-y-1">
                      <li>Ensure your face is clearly visible</li>
                      <li>Remove glasses if they cause glare</li>
                      <li>Use good lighting</li>
                      <li>Look directly at the camera</li>
                    </ul>
                  </div>
                </div>
              </div>

              <div>
                {showCamera ? (
                  <div className="relative">
                    <div className="relative bg-gray-900 rounded-lg overflow-hidden">
                      <video
                        ref={videoRef}
                        autoPlay
                        playsInline
                        muted
                        className="w-full max-w-md mx-auto block"
                        style={{ maxHeight: '400px', aspectRatio: '3/4', objectFit: 'cover' }}
                      />
                      {/* Loading indicator while camera initializes */}
                      {!stream && (
                        <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-50">
                          <div className="text-white text-center">
                            <Loader2 className="w-8 h-8 animate-spin mx-auto mb-2" />
                            <p>Initializing camera...</p>
                          </div>
                        </div>
                      )}
                    </div>
                    
                    {cameraError && (
                      <div className="bg-red-50 border border-red-200 rounded-lg p-3 mt-3 text-red-800 text-sm">
                        <p className="font-medium">Camera Error</p>
                        <p>{cameraError}</p>
                        {cameraError.includes('Android') && (
                          <p className="mt-2 font-medium">For Android users: Try using Chrome, Firefox, or Samsung Internet Browser for best camera support.</p>
                        )}
                      </div>
                    )}
                    
                    <canvas ref={canvasRef} className="hidden" />
                    
                    <div className="flex justify-center mt-4 space-x-4">
                      <button
                        onClick={capturePhoto}
                        disabled={!stream}
                        className={`px-6 py-3 rounded-lg transition-colors flex items-center ${
                          !stream 
                            ? 'bg-gray-400 text-white cursor-not-allowed' 
                            : 'bg-blue-600 text-white hover:bg-blue-700'
                        }`}
                      >
                        <Camera className="w-5 h-5 mr-2" />
                        Capture Photo
                      </button>
                      <button
                        onClick={stopCamera}
                        className="bg-gray-600 text-white px-6 py-3 rounded-lg hover:bg-gray-700 transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : selfiePreview ? (
                  <div className="relative max-w-md mx-auto">
                    <img 
                      src={selfiePreview} 
                      alt="Selfie preview" 
                      className="w-full rounded-lg shadow-md"
                    />
                    <button
                      onClick={() => {
                        setSelfieFile(null);
                        setSelfiePreview(null);
                        startCamera(); // Restart camera if user removes photo
                      }}
                      className="absolute top-2 right-2 bg-red-500 text-white p-2 rounded-full hover:bg-red-600 shadow-lg"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ) : (
                  <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center">
                    <Camera className="w-16 h-16 text-gray-400 mx-auto mb-4" />
                    <h3 className="text-lg font-medium text-gray-800 mb-2">Verify Your Identity</h3>
                    <p className="text-gray-600 mb-6">Take a clear selfie to match with your document</p>
                    <button
                      onClick={startCamera}
                      className="bg-blue-600 text-white px-8 py-3 rounded-lg hover:bg-blue-700 transition-colors flex items-center mx-auto"
                    >
                      <Camera className="w-5 h-5 mr-2" />
                      Start Camera
                    </button>
                    
                    {cameraError && (
                      <div className="bg-red-50 border border-red-200 rounded-lg p-3 mt-4 text-red-800 text-sm">
                        <p className="font-medium">Camera Error</p>
                        <p>{cameraError}</p>
                        {cameraError.includes('Android') && (
                          <p className="mt-2 font-medium">For Android users: Try using Chrome, Firefox, or Samsung Internet Browser for best camera support.</p>
                        )}
                      </div>
                    )}
                    
                    {/* Android-specific guidance */}
                    {/Android/i.test(navigator.userAgent) && (
                      <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mt-4 text-amber-800 text-sm">
                        <p className="font-medium">Android User?</p>
                        <p>For best camera support, use Chrome, Firefox, or Samsung Internet Browser.</p>
                        {window.location.protocol !== 'https:' && window.location.hostname !== 'localhost' && (
                          <p className="mt-2 font-medium">Note: Camera access on Android requires HTTPS.</p>
                        )}
                      </div>
                    )}
                  </div>
                )}
                {errors.selfie && !cameraError && (
                  <p className="mt-2 text-sm text-red-500 text-center">{errors.selfie}</p>
                )}
              </div>
            </div>
          )}

          {/* Navigation Buttons */}
          <div className="flex justify-between mt-8 pt-6 border-t border-gray-100">
            {currentStep > 1 && (
              <button
                onClick={() => setCurrentStep(currentStep - 1)}
                className="px-6 py-3 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors flex items-center"
              >
                <ChevronRight className="w-5 h-5 mr-2 rotate-180" />
                Previous
              </button>
            )}
            <button
              onClick={handleNext}
              disabled={isSubmitting}
              className={`px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center ml-auto ${
                isSubmitting ? 'opacity-50 cursor-not-allowed' : ''
              }`}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                  Submitting...
                </>
              ) : currentStep === 2 ? (
                'Submit for Verification'
              ) : (
                <>
                  Next Step
                  <ChevronRight className="w-5 h-5 ml-2" />
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default KYCSubmissionWebsite;