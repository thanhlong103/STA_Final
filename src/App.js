import React, { useState, useEffect } from 'react';
import {
  Box,
  Button,
  TextField,
  Typography,
  CircularProgress,
  Grid,
  Card,
  CardContent,
  Tooltip,
  Fade,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  AppBar,
  Toolbar,
} from '@mui/material';
import { Bluetooth as BluetoothIcon, Settings } from '@mui/icons-material';
import { createTheme, ThemeProvider } from '@mui/material/styles';
import './App.css';

// Custom futuristic theme
const theme = createTheme({
  palette: {
    mode: 'dark',
    primary: { main: '#00e5ff' }, // Neon cyan
    secondary: { main: '#ff4081' }, // Neon pink
    background: { default: '#0a0a0a', paper: '#1c2526' },
  },
  typography: {
    fontFamily: '"Roboto", "Helvetica", "Arial", sans-serif',
    h4: { fontSize: '2rem', fontWeight: 700, letterSpacing: '0.05em' },
    h6: { fontSize: '1.2rem', fontWeight: 500 },
    body1: { fontSize: '1rem' },
    body2: { fontSize: '0.9rem' },
  },
  components: {
    MuiButton: {
      styleOverrides: {
        root: {
          borderRadius: 12,
          padding: '10px 20px',
          textTransform: 'none',
          background: 'linear-gradient(45deg, #00e5ff 30%, #ff4081 90%)',
          '&:hover': {
            background: 'linear-gradient(45deg, #00b8d4 30%, #c51162 90%)',
            transform: 'scale(1.05)',
            transition: 'all 0.3s',
          },
        },
      },
    },
    MuiTextField: {
      styleOverrides: {
        root: {
          '& .MuiInputBase-root': {
            backgroundColor: '#2e3b3e',
            borderRadius: 8,
            '&:hover': {
              boxShadow: '0 0 10px rgba(0, 229, 255, 0.3)',
            },
          },
          '& .MuiInputBase-input': {
            color: '#00e5ff',
            padding: '8px',
          },
          '& .MuiOutlinedInput-notchedOutline': {
            borderColor: 'rgba(0, 229, 255, 0.2)',
          },
          '&:hover .MuiOutlinedInput-notchedOutline': {
            borderColor: '#00e5ff',
          },
        },
      },
    },
    MuiCard: {
      styleOverrides: {
        root: {
          borderRadius: 16,
          border: '1px solid rgba(0, 229, 255, 0.2)',
          boxShadow: '0 8px 32px rgba(0, 229, 255, 0.1)',
          background: 'linear-gradient(135deg, #1c2526 0%, #2e3b3e 100%)',
        },
      },
    },
    MuiSelect: {
      styleOverrides: {
        root: {
          backgroundColor: '#2e3b3e',
          borderRadius: 8,
          color: '#00e5ff',
          '& .MuiOutlinedInput-notchedOutline': {
            borderColor: 'rgba(0, 229, 255, 0.2)',
          },
          '&:hover .MuiOutlinedInput-notchedOutline': {
            borderColor: '#00e5ff',
          },
        },
      },
    },
    MuiAppBar: {
      styleOverrides: {
        root: {
          background: 'linear-gradient(45deg, #1c2526 0%, #2e3b3e 100%)',
          borderBottom: '1px solid rgba(0, 229, 255, 0.2)',
        },
      },
    },
  },
});

const App = () => {
  const [device, setDevice] = useState(null);
  const [characteristic, setCharacteristic] = useState(null);
  const [status, setStatus] = useState('Disconnected');
  const [pendingControlValues, setPendingControlValues] = useState({ kp: 60.0, ki: 270.0, kd: 2.2, setpoint: 3.6 });
  const [imuData, setImuData] = useState({
    accX: 0,
    accY: 0,
    accZ: 0,
    gyroX: 0,
    gyroY: 0,
    gyroZ: 0,
    angle: 0,
    motorSpeed: 0,
    mode: 0,
  });
  const [isConnecting, setIsConnecting] = useState(false);

  const serviceUUID = '4fafc201-1fb5-459e-8fcc-c5c9c331914b';
  const charUUID = 'beb5483e-36e1-4688-b7f5-ea07361b26a8';

  // Handle Bluetooth connection
  const handleConnect = async () => {
    if (!navigator.bluetooth) {
      setStatus('Web Bluetooth API is not supported in this browser.');
      return;
    }

    setIsConnecting(true);
    try {
      const device = await navigator.bluetooth.requestDevice({
        filters: [{ name: 'SelfBalancingRobot' }],
        optionalServices: [serviceUUID],
      });
      const server = await device.gatt.connect();
      const service = await server.getPrimaryService(serviceUUID);
      const char = await service.getCharacteristic(charUUID);

      await char.startNotifications();
      char.addEventListener('characteristicvaluechanged', handleDataUpdate);

      setDevice(device);
      setCharacteristic(char);
      setStatus('Connected');
    } catch (error) {
      console.error('Connection failed:', error);
      setStatus(`Error: ${error.message}`);
    } finally {
      setIsConnecting(false);
    }
  };

  // Handle incoming data (IMU, angle, motor speed, mode)
  const handleDataUpdate = (event) => {
    const value = new TextDecoder().decode(event.target.value);
    const [
      accX,
      accY,
      accZ,
      gyroX,
      gyroY,
      gyroZ,
      angle,
      motorSpeed,
      mode,
    ] = value.split(',').map(parseFloat);
    setImuData({
      accX,
      accY,
      accZ,
      gyroX,
      gyroY,
      gyroZ,
      angle,
      motorSpeed: parseInt(motorSpeed),
      mode: parseInt(mode),
    });
  };

  // Handle control input changes
  const handleControlInputChange = (key) => (e) => {
    const newValue = parseFloat(e.target.value);
    if (isNaN(newValue)) return; // Ignore invalid inputs
    let clampedValue;
    if (key === 'setpoint') {
      clampedValue = Math.max(-10, Math.min(10, newValue)); // Clamp setpoint to -10 to 10
    } else {
      clampedValue = Math.max(0, Math.min(3000, newValue)); // Clamp PID to 0-3000
    }
    setPendingControlValues({ ...pendingControlValues, [key]: clampedValue });
  };

  // Handle sending control values
  const handleSendControl = async () => {
    if (characteristic) {
      try {
        const data = `PID:${pendingControlValues.kp.toFixed(1)},${pendingControlValues.ki.toFixed(1)},${pendingControlValues.kd.toFixed(1)},${pendingControlValues.setpoint.toFixed(1)}`;
        await characteristic.writeValue(new TextEncoder().encode(data));
      } catch (error) {
        console.error('Write failed:', error);
        setStatus(`Error: ${error.message}`);
      }
    }
  };

  // Handle mode change
  const handleModeChange = async (event) => {
    const newMode = event.target.value;
    if (characteristic) {
      try {
        const data = `MODE:${newMode}`;
        await characteristic.writeValue(new TextEncoder().encode(data));
        setImuData({ ...imuData, mode: newMode });
      } catch (error) {
        console.error('Write failed:', error);
        setStatus(`Error: ${error.message}`);
      }
    }
  };

  // Handle movement commands
  const handleMovement = (cmd) => async () => {
    if (characteristic) {
      try {
        const data = `CMD:${cmd}`;
        await characteristic.writeValue(new TextEncoder().encode(data));
      } catch (error) {
        console.error('Write failed:', error);
        setStatus(`Error: ${error.message}`);
      }
    }
  };

  // Keyboard controls
  useEffect(() => {
    const handleKeyDown = (event) => {
      if (!device || imuData.mode !== 1) return; // Only in Control Mode when connected
      switch (event.key.toLowerCase()) {
        case 'w':
          handleMovement('FWD')();
          break;
        case 's':
          handleMovement('BWD')();
          break;
        case 'a':
          handleMovement('LEFT')();
          break;
        case 'd':
          handleMovement('RIGHT')();
          break;
        case ' ':
          handleMovement('STOP')();
          break;
        default:
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [device, imuData.mode]);

  // Handle disconnection
  useEffect(() => {
    if (device) {
      const handleDisconnect = () => {
        setStatus('Disconnected');
        setDevice(null);
        setCharacteristic(null);
        setPendingControlValues({ kp: 60.0, ki: 270.0, kd: 2.2, setpoint: 3.6 });
        setImuData({
          accX: 0,
          accY: 0,
          accZ: 0,
          gyroX: 0,
          gyroY: 0,
          gyroZ: 0,
          angle: 0,
          motorSpeed: 0,
          mode: 0,
        });
      };
      device.addEventListener('gattserverdisconnected', handleDisconnect);
      return () => {
        device.removeEventListener('gattserverdisconnected', handleDisconnect);
      };
    }
  }, [device]);

  // Cleanup notifications
  useEffect(() => {
    return () => {
      if (characteristic) {
        characteristic.removeEventListener('characteristicvaluechanged', handleDataUpdate);
      }
    };
  }, [characteristic]);

  return (
    <ThemeProvider theme={theme}>
      <Box sx={{ minHeight: '100vh', bgcolor: 'background.default', display: 'flex', flexDirection: 'column' }}>
        {/* Top Bar */}
        <AppBar position="static">
          <Toolbar sx={{ justifyContent: 'space-between' }}>
            <Typography variant="h6" className="logo-text">
              Self-Balancing Robot
            </Typography>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
              <Fade in={true} timeout={1000}>
                <Box className={status === 'Connected' ? 'status-pulse-connected' : 'status-pulse-disconnected'}>
                  <Typography variant="body2">
                    Status: {status}
                  </Typography>
                </Box>
              </Fade>
              <Tooltip title={isConnecting || device ? 'Connected or Connecting' : 'Connect to Robot'}>
                <span>
                  <Button
                    variant="contained"
                    size="small"
                    startIcon={<BluetoothIcon className={isConnecting ? 'bluetooth-spin' : ''} />}
                    onClick={handleConnect}
                    disabled={isConnecting || device}
                  >
                    {isConnecting ? <CircularProgress size={20} color="inherit" /> : 'Connect'}
                  </Button>
                </span>
              </Tooltip>
            </Box>
          </Toolbar>
        </AppBar>
        {/* Main Content */}
        <Box sx={{ flexGrow: 1, p: 2, overflow: 'hidden' }}>
          <Fade in={true} timeout={1500}>
            <Typography variant="h4" align="center" gutterBottom className="header-text" sx={{ mb: 2 }}>
              Robot Dashboard
            </Typography>
          </Fade>
          <Grid container spacing={20} sx={{ height: 'calc(100vh - 140px)' }}>
            {/* Control Tuning Panel */}
            <Grid item xs={12} md={4}>
              <Fade in={true} timeout={1800}>
                <Card sx={{ height: '80%', p: 2, overflow: 'auto' , width: '125%'}}>
                  <CardContent sx={{ p: 1 }}>
                    <Typography variant="h6" gutterBottom>
                      <Settings sx={{ verticalAlign: 'middle', mr: 1 }} />
                      Control Tuning
                    </Typography>
                    {['kp', 'ki', 'kd', 'setpoint'].map((key) => (
                      <Box key={key} sx={{ mt: 1 }}>
                        <Typography variant="body2">
                          {key === 'setpoint' ? 'Setpoint (°)' : key.toUpperCase()}
                        </Typography>
                        <TextField
                          type="number"
                          value={pendingControlValues[key]}
                          onChange={handleControlInputChange(key)}
                          disabled={!device}
                          inputProps={{
                            min: key === 'setpoint' ? -10 : 0,
                            max: key === 'setpoint' ? 10 : 3000,
                            step: 0.1,
                          }}
                          fullWidth
                          size="small"
                          sx={{ mt: 0.5 }}
                        />
                      </Box>
                    ))}
                    <Button
                      variant="contained"
                      onClick={handleSendControl}
                      disabled={!device}
                      sx={{ mt: 2, width: '100%' }}
                    >
                      Send Control Values
                    </Button>
                    <FormControl fullWidth sx={{ mt: 2 }}>
                      <InputLabel>Mode</InputLabel>
                      <Select
                        value={imuData.mode}
                        onChange={handleModeChange}
                        disabled={!device}
                        label="Mode"
                        size="small"
                      >
                        <MenuItem value={0}>Balancing Mode</MenuItem>
                        <MenuItem value={1}>Control Mode</MenuItem>
                      </Select>
                    </FormControl>
                  </CardContent>
                </Card>
              </Fade>
            </Grid>
            {/* IMU Data Panel */}
            <Grid item xs={12} md={4}>
              <Fade in={true} timeout={2000}>
                <Card sx={{ height: '80%', p: 2, overflow: 'auto' , width: '150%'}}>
                  <CardContent sx={{ p: 1 }}>
                    <Typography variant="h6" gutterBottom>
                      <Settings sx={{ verticalAlign: 'middle', mr: 1 }} />
                      IMU Data
                    </Typography>
                    <Typography variant="body2">
                      Mode: <strong>{imuData.mode === 0 ? 'Balancing' : 'Control'}</strong>
                    </Typography>
                    <Box sx={{ display: 'flex', justifyContent: 'center', my: 2 }}>
                      <Box className="imu-gauge" sx={{ position: 'relative', width: 100, height: 100 }}>
                        <Box className="gauge-needle" style={{ transform: `rotate(${imuData.angle}deg)` }} />
                        <Typography variant="body2" sx={{ position: 'absolute', bottom: -20, width: '100%', textAlign: 'center' }}>
                          Tilt: {imuData.angle.toFixed(1)} °
                        </Typography>
                      </Box>
                    </Box>
                    <Typography variant="body2">Accel X: <strong>{imuData.accX.toFixed(2)} g</strong></Typography>
                    <Typography variant="body2">Accel Y: <strong>{imuData.accY.toFixed(2)} g</strong></Typography>
                    <Typography variant="body2">Accel Z: <strong>{imuData.accZ.toFixed(2)} g</strong></Typography>
                    <Typography variant="body2">Gyro X: <strong>{imuData.gyroX.toFixed(2)} °/s</strong></Typography>
                    <Typography variant="body2">Gyro Y: <strong>{imuData.gyroY.toFixed(2)} °/s</strong></Typography>
                    <Typography variant="body2">Gyro Z: <strong>{imuData.gyroZ.toFixed(2)} °/s</strong></Typography>
                    <Typography variant="body2">Motor Speed: <strong>{imuData.motorSpeed} PWM</strong></Typography>
                  </CardContent>
                </Card>
              </Fade>
            </Grid>
            {/* Movement Controls Panel */}
            <Grid item xs={12} md={4}>
              <Fade in={true} timeout={2200}>
                <Card sx={{ height: '80%', p: 2, overflow: 'auto', width: '150%' }}>
                  <CardContent sx={{ p: 1, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                    <Typography variant="h6" gutterBottom>
                      <Settings sx={{ verticalAlign: 'middle', mr: 1 }} />
                      Movement Controls
                    </Typography>
                    <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 1, width: '100%', maxWidth: 300 }}>
                      <Box></Box>
                      <Button
                        variant="contained"
                        onClick={handleMovement('FWD')}
                        disabled={!device || imuData.mode !== 1}
                        sx={{ height: 80, fontSize: '1rem', display: 'flex', flexDirection: 'column', gap: 1 }}
                      >
                        Forward
                        <Typography variant="caption">(W)</Typography>
                      </Button>
                      <Box></Box>
                      <Button
                        variant="contained"
                        onClick={handleMovement('LEFT')}
                        disabled={!device || imuData.mode !== 1}
                        sx={{ height: 80, fontSize: '1rem', display: 'flex', flexDirection: 'column', gap: 1 }}
                      >
                        Left
                        <Typography variant="caption">(A)</Typography>
                      </Button>
                      <Button
                        variant="contained"
                        onClick={handleMovement('STOP')}
                        disabled={!device || imuData.mode !== 1}
                        sx={{ height: 80, fontSize: '1rem', display: 'flex', flexDirection: 'column', gap: 1, bgcolor: 'secondary.main', '&:hover': { bgcolor: 'secondary.dark' } }}
                      >
                        Stop
                        <Typography variant="caption">(Space)</Typography>
                      </Button>
                      <Button
                        variant="contained"
                        onClick={handleMovement('RIGHT')}
                        disabled={!device || imuData.mode !== 1}
                        sx={{ height: 80, fontSize: '1rem', display: 'flex', flexDirection: 'column', gap: 1 }}
                      >
                        Right
                        <Typography variant="caption">(D)</Typography>
                      </Button>
                      <Box></Box>
                      <Button
                        variant="contained"
                        onClick={handleMovement('BWD')}
                        disabled={!device || imuData.mode !== 1}
                        sx={{ height: 80, fontSize: '1rem', display: 'flex', flexDirection: 'column', gap: 1 }}
                      >
                        Backward
                        <Typography variant="caption">(S)</Typography>
                      </Button>
                      <Box></Box>
                    </Box>
                  </CardContent>
                </Card>
              </Fade>
            </Grid>
          </Grid>
        </Box>
      </Box>
    </ThemeProvider>
  );
};

const App = () => {
  const [device, setDevice] = useState(null);
  const [characteristic, setCharacteristic] = useState(null);
  const [status, setStatus] = useState('Disconnected');
  const [desiredSpeed, setDesiredSpeed] = useState(0);
  const [currentSpeeds, setCurrentSpeeds] = useState({ left: 0, right: 0 });
  const [pidValues, setPidValues] = useState({ kp: 1.0, ki: 0.1, kd: 0.05 });
  const [imuData, setImuData] = useState({
    ax: 0,
    ay: 0,
    az: 0,
    gx: 0,
    gy: 0,
    gz: 0,
  });
  const [isConnecting, setIsConnecting] = useState(false);

  const serviceUUID = '4fafc201-1fb5-459e-8fcc-c5c9c331914b';
  const charUUID = 'beb5483e-36e1-4688-b7f5-ea07361b26a8';

  // Handle Bluetooth connection
  const handleConnect = async () => {
    if (!navigator.bluetooth) {
      setStatus('Web Bluetooth API is not supported in this browser.');
      return;
    }

    setIsConnecting(true);
    try {
      const device = await navigator.bluetooth.requestDevice({
        filters: [{ name: 'MotorControl' }],
        optionalServices: [serviceUUID],
      });
      const server = await device.gatt.connect();
      const service = await server.getPrimaryService(serviceUUID);
      const char = await service.getCharacteristic(charUUID);

      await char.startNotifications();
      char.addEventListener('characteristicvaluechanged', handleDataUpdate);

      setDevice(device);
      setCharacteristic(char);
      setStatus('Connected');
    } catch (error) {
      console.error('Connection failed:', error);
      setStatus(`Error: ${error.message}`);
    } finally {
      setIsConnecting(false);
    }
  };

  // Handle incoming data (RPM and IMU)
  const handleDataUpdate = (event) => {
    const value = event.target.value;
    const type = value.getUint8(0);
    if (type === 0x01) {
      const leftRpm = (value.getUint8(1) << 8) | value.getUint8(2);
      const rightRpm = (value.getUint8(3) << 8) | value.getUint8(4);
      setCurrentSpeeds({ left: leftRpm, right: rightRpm });
    } else if (type === 0x02) {
      setImuData({
        ax: (value.getUint8(1) << 8) | value.getUint8(2),
        ay: (value.getUint8(3) << 8) | value.getUint8(4),
        az: (value.getUint8(5) << 8) | value.getUint8(6),
        gx: (value.getUint8(7) << 8) | value.getUint8(8),
        gy: (value.getUint8(9) << 8) | value.getUint8(10),
        gz: (value.getUint8(11) << 8) | value.getUint8(12),
      });
    }
  };

  // Handle speed slider change
  const handleSpeedChange = async (e, newValue) => {
    const speed = newValue;
    setDesiredSpeed(speed);
    if (characteristic) {
      try {
        const pwmValue = Math.round((speed / 100) * 255);
        await characteristic.writeValue(new Uint8Array([0x01, pwmValue]));
      } catch (error) {
        console.error('Write failed:', error);
        setStatus(`Error: ${error.message}`);
      }
    }
  };

  // Handle PID value changes
  const handlePidChange = async (key) => async (e, newValue) => {
    const newPidValues = { ...pidValues, [key]: newValue };
    setPidValues(newPidValues);
    if (characteristic) {
      try {
        const kp = Math.round(newPidValues.kp * 1000);
        const ki = Math.round(newPidValues.ki * 1000);
        const kd = Math.round(newPidValues.kd * 1000);
        const data = new Uint8Array([
          0x02,
          (kp >> 8) & 0xff,
          kp & 0xff,
          (ki >> 8) & 0xff,
          ki & 0xff,
          (kd >> 8) & 0xff,
          kd & 0xff,
        ]);
        await characteristic.writeValue(data);
      } catch (error) {
        console.error('Write failed:', error);
        setStatus(`Error: ${error.message}`);
      }
    }
  };

  // Handle movement commands
  const handleMovement = (cmd) => async () => {
    if (characteristic) {
      try {
        await characteristic.writeValue(new Uint8Array([0x03, cmd]));
      } catch (error) {
        console.error('Write failed:', error);
        setStatus(`Error: ${error.message}`);
      }
    }
  };

  // Handle disconnection
  useEffect(() => {
    if (device) {
      const handleDisconnect = () => {
        setStatus('Disconnected');
        setDevice(null);
        setCharacteristic(null);
        setDesiredSpeed(0);
        setCurrentSpeeds({ left: 0, right: 0 });
        setImuData({ ax: 0, ay: 0, az: 0, gx: 0, gy: 0, gz: 0 });
      };
      device.addEventListener('gattserverdisconnected', handleDisconnect);
      return () => {
        device.removeEventListener('gattserverdisconnected', handleDisconnect);
      };
    }
  }, [device]);

  // Cleanup notifications
  useEffect(() => {
    return () => {
      if (characteristic) {
        characteristic.removeEventListener('characteristicvaluechanged', handleDataUpdate);
      }
    };
  }, [characteristic]);

  return (
    <ThemeProvider theme={theme}>
      <Box sx={{ minHeight: '100vh', bgcolor: 'background.default', display: 'flex' }}>
        {/* Sidebar */}
        <Drawer
          variant="permanent"
          sx={{
            width: 300,
            flexShrink: 0,
            '& .MuiDrawer-paper': {
              width: 300,
              bgcolor: 'background.paper',
              borderRight: '1px solid rgba(0, 229, 255, 0.2)',
            },
          }}
        >
          <Box sx={{ p: 3, textAlign: 'center' }}>
            <Typography variant="h6" className="logo-text">
              CyberBot Control
            </Typography>
            <Divider sx={{ my: 2, bgcolor: 'primary.main' }} />
            <Fade in={true} timeout={1000}>
              <Box className={status === 'Connected' ? 'status-pulse-connected' : 'status-pulse-disconnected'}>
                <Typography variant="body1" sx={{ mb: 2 }}>
                  Status: {status}
                </Typography>
              </Box>
            </Fade>
            <Tooltip title={isConnecting || device ? 'Connected or Connecting' : 'Connect to ESP32'}>
              <span>
                <Button
                  variant="contained"
                  size="large"
                  startIcon={<BluetoothIcon className={isConnecting ? 'bluetooth-spin' : ''} />}
                  onClick={handleConnect}
                  disabled={isConnecting || device}
                  sx={{ width: '100%', py: 2 }}
                >
                  {isConnecting ? (
                    <CircularProgress size={24} color="inherit" />
                  ) : (
                    'Connect'
                  )}
                </Button>
              </span>
            </Tooltip>
          </Box>
        </Drawer>
        {/* Main Content */}
        <Box sx={{ flexGrow: 1, p: 4, overflow: 'auto' }}>
          <Fade in={true} timeout={1500}>
            <Typography variant="h3" align="center" gutterBottom className="header-text">
              Robotics Dashboard
            </Typography>
          </Fade>
          <Grid container spacing={4}>
            {/* Motor Speed Control */}
            <Grid item xs={12} md={6}>
              <Fade in={true} timeout={1800}>
                <Card sx={{ p: 4, minHeight: 300 }}>
                  <CardContent>
                    <Typography variant="h6" gutterBottom>
                      <Settings sx={{ verticalAlign: 'middle', mr: 1 }} />
                      Motor Speed Control
                    </Typography>
                    <Slider
                      value={desiredSpeed}
                      onChange={handleSpeedChange}
                      min={0}
                      max={100}
                      disabled={!device}
                      valueLabelDisplay="auto"
                      size="medium"
                      sx={{ mt: 6, mb: 4 }}
                    />
                    <Typography variant="body1">
                      Desired Speed: <strong>{desiredSpeed}%</strong>
                    </Typography>
                    <Typography variant="body1" sx={{ mt: 2 }}>
                      Left Motor: <strong>{currentSpeeds.left} RPM</strong>
                    </Typography>
                    <Typography variant="body1">
                      Right Motor: <strong>{currentSpeeds.right} RPM</strong>
                    </Typography>
                  </CardContent>
                </Card>
              </Fade>
            </Grid>
            {/* PID Tuning */}
            <Grid item xs={12} md={6}>
              <Fade in={true} timeout={2000}>
                <Card sx={{ p: 4, minHeight: 300 }}>
                  <CardContent>
                    <Typography variant="h6" gutterBottom>
                      <Settings sx={{ verticalAlign: 'middle', mr: 1 }} />
                      PID Tuning
                    </Typography>
                    {['kp', 'ki', 'kd'].map((key) => (
                      <Box key={key} sx={{ mt: 3 }}>
                        <Typography variant="body1">
                          {key.toUpperCase()}: {pidValues[key].toFixed(2)}
                        </Typography>
                        <Slider
                          value={pidValues[key]}
                          onChange={handlePidChange(key)}
                          min={0}
                          max={key === 'kp' ? 10 : 1}
                          step={key === 'kp' ? 0.1 : 0.01}
                          disabled={!device}
                          valueLabelDisplay="auto"
                          size="medium"
                        />
                      </Box>
                    ))}
                  </CardContent>
                </Card>
              </Fade>
            </Grid>
            {/* IMU Data */}
            <Grid item xs={12} md={6}>
              <Fade in={true} timeout={2200}>
                <Card sx={{ p: 4, minHeight: 300 }}>
                  <CardContent>
                    <Typography variant="h6" gutterBottom>
                      <Settings sx={{ verticalAlign: 'middle', mr: 1 }} />
                      IMU Data Stream
                    </Typography>
                    <Box sx={{ display: 'flex', justifyContent: 'center', my: 4 }}>
                      <Box className="imu-gauge" sx={{ position: 'relative', width: 150, height: 150 }}>
                        <Box className="gauge-needle" style={{ transform: `rotate(${(imuData.gz / 100) * 0.5}deg)` }} />
                        <Typography variant="body1" sx={{ position: 'absolute', bottom: -30, width: '100%', textAlign: 'center' }}>
                          Yaw: {(imuData.gz / 100).toFixed(1)} °/s
                        </Typography>
                      </Box>
                    </Box>
                    <Typography variant="body1">Accel X: <strong>{(imuData.ax / 100).toFixed(2)} g</strong></Typography>
                    <Typography variant="body1">Accel Y: <strong>{(imuData.ay / 100).toFixed(2)} g</strong></Typography>
                    <Typography variant="body1">Accel Z: <strong>{(imuData.az / 100).toFixed(2)} g</strong></Typography>
                  </CardContent>
                </Card>
              </Fade>
            </Grid>
            {/* Robot Control */}
            <Grid item xs={12} md={6}>
              <Fade in={true} timeout={2400}>
                <Card sx={{ p: 4, minHeight: 300 }}>
                  <CardContent>
                    <Typography variant="h6" gutterBottom>
                      <Settings sx={{ verticalAlign: 'middle', mr: 1 }} />
                      Robot Movement
                    </Typography>
                    <Box sx={{ display: 'flex', justifyContent: 'center', gap: 3, flexWrap: 'wrap', mt: 4 }}>
                      <Tooltip title="Move Forward">
                        <IconButton
                          color="primary"
                          onClick={handleMovement(1)}
                          disabled={!device}
                          size="large"
                          sx={{ p: 3, bgcolor: 'rgba(0, 229, 255, 0.1)', '&:hover': { bgcolor: 'rgba(0, 229, 255, 0.3)' } }}
                        >
                          <ArrowUpward fontSize="large" />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="Turn Left">
                        <IconButton
                          color="primary"
                          onClick={handleMovement(3)}
                          disabled={!device}
                          size="large"
                          sx={{ p: 3, bgcolor: 'rgba(0, 229, 255, 0.1)', '&:hover': { bgcolor: 'rgba(0, 229, 255, 0.3)' } }}
                        >
                          <ArrowLeft fontSize="large" />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="Stop">
                        <IconButton
                          color="secondary"
                          onClick={handleMovement(0)}
                          disabled={!device}
                          size="large"
                          sx={{ p: 3, bgcolor: 'rgba(255, 64, 129, 0.1)', '&:hover': { bgcolor: 'rgba(255, 64, 129, 0.3)' } }}
                        >
                          <Stop fontSize="large" />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="Turn Right">
                        <IconButton
                          color="primary"
                          onClick={handleMovement(4)}
                          disabled={!device}
                          size="large"
                          sx={{ p: 3, bgcolor: 'rgba(0, 229, 255, 0.1)', '&:hover': { bgcolor: 'rgba(0, 229, 255, 0.3)' } }}
                        >
                          <ArrowRight fontSize="large" />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="Move Backward">
                        <IconButton
                          color="primary"
                          onClick={handleMovement(2)}
                          disabled={!device}
                          size="large"
                          sx={{ p: 3, bgcolor: 'rgba(0, 229, 255, 0.1)', '&:hover': { bgcolor: 'rgba(0, 229, 255, 0.3)' } }}
                        >
                          <ArrowDownward fontSize="large" />
                        </IconButton>
                      </Tooltip>
                    </Box>
                  </CardContent>
                </Card>
              </Fade>
            </Grid>
          </Grid>
        </Box>
      </Box>
    </ThemeProvider>
  );
};

export default App;