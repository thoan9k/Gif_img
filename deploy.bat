@echo off
setlocal

set DEPLOY_DIR=C:\Tools\ALLINONE_APP_Versions
set QT_DEPLOY=C:\Qt_\6.9.3\msvc2022_64\bin\windeployqt.exe
set BUILD_DIR=%~dp0

echo ============================================
echo  VitLabTool Deploy
echo ============================================

:: 1. windeployqt
echo [1/3] Running windeployqt...
"%QT_DEPLOY%" "%DEPLOY_DIR%\VitLabTool.exe"
if %ERRORLEVEL% neq 0 (
    echo FAILED: windeployqt
    pause
    exit /b 1
)

:: 2. Copy Plugins folder
echo [2/3] Copying Plugins folder...
if exist "%BUILD_DIR%Plugins" (
    xcopy /E /I /Y "%BUILD_DIR%Plugins" "%DEPLOY_DIR%\Plugins"
) else (
    echo WARNING: Plugins folder not found at %BUILD_DIR%Plugins
)

:: 3. Copy extra DLLs
echo [3/3] Copying extra DLLs...
set DLLS=libcrypto-3-x64.dll libssl-3-x64.dll zlib1.dll vxlapi64.dll opencv_world4120.dll opencv_videoio_ffmpeg4120_64.dll Vector_BLF.dll

:: Copy Qt6OpenGL.dll mà windeployqt có thể bỏ sót
copy /Y "C:\Qt_\6.9.3\msvc2022_64\bin\Qt6OpenGL.dll" "%DEPLOY_DIR%\" >nul
echo   OK: Qt6OpenGL.dll

for %%F in (%DLLS%) do (
    if exist "%BUILD_DIR%%%F" (
        copy /Y "%BUILD_DIR%%%F" "%DEPLOY_DIR%\" >nul
        echo   OK: %%F
    ) else (
        echo   SKIP: %%F not found in %BUILD_DIR%
    )
)

echo ============================================
echo  Deploy complete!
echo ============================================
pause
